export async function onRequest(context) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sassy Browser - The $15,000/Year Software Killer</title>
  <meta name="description" content="Pure Rust browser that replaces Chrome, LastPass, Postman, Adobe Reader, and 200+ paid apps. Save $15,000+/year with one download.">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      color: #e0e0e0;
      line-height: 1.6;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 20px;
    }
    
    /* Hero Section */
    .hero {
      padding: 80px 0;
      text-align: center;
      background: linear-gradient(135deg, #1a1a2e 0%, #0f0f23 100%);
      border-bottom: 1px solid #333;
    }
    .hero h1 {
      font-size: 3.5rem;
      font-weight: 900;
      margin-bottom: 20px;
      background: linear-gradient(135deg, #ff6b6b, #ff4757);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .hero .subtitle {
      font-size: 1.5rem;
      color: #b0b0b0;
      margin-bottom: 30px;
    }
    .hero .cta {
      display: inline-block;
      padding: 15px 40px;
      background: #ff4757;
      color: white;
      text-decoration: none;
      border-radius: 8px;
      font-weight: bold;
      font-size: 1.2rem;
      transition: all 0.3s;
    }
    .hero .cta:hover {
      background: #ff6b6b;
      transform: translateY(-2px);
    }
    
    /* Replacement Table */
    .replacements {
      padding: 60px 0;
      background: #0f0f23;
    }
    .replacements h2 {
      font-size: 2.5rem;
      text-align: center;
      margin-bottom: 40px;
      color: #ff4757;
    }
    .replacement-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
      margin-bottom: 40px;
    }
    .replacement-card {
      background: #1a1a2e;
      border: 1px solid #333;
      border-radius: 8px;
      padding: 20px;
    }
    .replacement-card h3 {
      color: #ff6b6b;
      margin-bottom: 10px;
    }
    .replacement-card .old {
      color: #888;
      text-decoration: line-through;
      margin-bottom: 5px;
    }
    .replacement-card .new {
      color: #4ecdc4;
      font-weight: bold;
    }
    .replacement-card .savings {
      color: #ffd93d;
      font-size: 0.9rem;
      margin-top: 10px;
    }
    
    /* File Formats Section */
    .formats {
      padding: 60px 0;
      background: #0a0a0a;
    }
    .formats h2 {
      font-size: 2.5rem;
      text-align: center;
      margin-bottom: 40px;
      color: #4ecdc4;
    }
    .format-category {
      margin-bottom: 30px;
      border: 1px solid #333;
      border-radius: 8px;
      overflow: hidden;
    }
    .format-category-header {
      background: #1a1a2e;
      padding: 15px 20px;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .format-category-header:hover {
      background: #252538;
    }
    .format-category-header h3 {
      color: #4ecdc4;
      margin: 0;
    }
    .format-category-content {
      padding: 20px;
      background: #0f0f23;
      display: none;
    }
    .format-category.open .format-category-content {
      display: block;
    }
    .format-list {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .format-tag {
      background: #252538;
      padding: 5px 12px;
      border-radius: 20px;
      font-size: 0.9rem;
      color: #b0b0b0;
    }
    
    /* Security Architecture */
    .security {
      padding: 60px 0;
      background: #0f0f23;
    }
    .security h2 {
      font-size: 2.5rem;
      text-align: center;
      margin-bottom: 40px;
      color: #ffd93d;
    }
    .security-layers {
      max-width: 800px;
      margin: 0 auto;
    }
    .security-layer {
      background: #1a1a2e;
      border: 2px solid #333;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
      position: relative;
    }
    .security-layer::before {
      content: attr(data-layer);
      position: absolute;
      top: -12px;
      left: 20px;
      background: #ff4757;
      color: white;
      padding: 2px 10px;
      border-radius: 4px;
      font-weight: bold;
      font-size: 0.8rem;
    }
    .security-layer h3 {
      color: #ffd93d;
      margin-bottom: 10px;
    }
    
    /* Features Grid */
    .features {
      padding: 60px 0;
      background: #0a0a0a;
    }
    .features h2 {
      font-size: 2.5rem;
      text-align: center;
      margin-bottom: 40px;
      color: #ff4757;
    }
    .feature-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
      gap: 30px;
    }
    .feature-card {
      background: #1a1a2e;
      border: 1px solid #333;
      border-radius: 8px;
      padding: 30px;
    }
    .feature-card h3 {
      color: #4ecdc4;
      margin-bottom: 15px;
      font-size: 1.5rem;
    }
    .feature-card p {
      color: #b0b0b0;
      line-height: 1.8;
    }
    .feature-card .badge {
      display: inline-block;
      background: #ff4757;
      color: white;
      padding: 3px 10px;
      border-radius: 4px;
      font-size: 0.8rem;
      margin-top: 10px;
    }
    
    /* FAQ Section */
    .faq {
      padding: 60px 0;
      background: #0f0f23;
    }
    .faq h2 {
      font-size: 2.5rem;
      text-align: center;
      margin-bottom: 40px;
      color: #4ecdc4;
    }
    .faq-item {
      background: #1a1a2e;
      border: 1px solid #333;
      border-radius: 8px;
      margin-bottom: 20px;
      overflow: hidden;
    }
    .faq-question {
      padding: 20px;
      cursor: pointer;
      font-weight: bold;
      color: #e0e0e0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .faq-question:hover {
      background: #252538;
    }
    .faq-answer {
      padding: 0 20px 20px;
      color: #b0b0b0;
      display: none;
    }
    .faq-item.open .faq-answer {
      display: block;
    }
    
    /* Footer CTA */
    .footer-cta {
      padding: 80px 0;
      text-align: center;
      background: linear-gradient(135deg, #1a1a2e 0%, #0f0f23 100%);
    }
    .footer-cta h2 {
      font-size: 2.5rem;
      margin-bottom: 20px;
      color: #ff4757;
    }
    .footer-cta p {
      font-size: 1.2rem;
      color: #b0b0b0;
      margin-bottom: 30px;
    }
    
    @media (max-width: 768px) {
      .hero h1 { font-size: 2.5rem; }
      .hero .subtitle { font-size: 1.2rem; }
      .replacement-grid { grid-template-columns: 1fr; }
      .feature-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <!-- Hero Section -->
  <section class="hero">
    <div class="container">
      <h1>The $15,000/Year Software Killer</h1>
      <p class="subtitle">One browser. 200+ file formats. Zero subscriptions.</p>
      <a href="#waitlist" class="cta">Join the Waitlist</a>
    </div>
  </section>

  <!-- What It Replaces -->
  <section class="replacements">
    <div class="container">
      <h2>What Sassy Browser Replaces</h2>
      <div class="replacement-grid">
        <div class="replacement-card">
          <h3>Web Browsing</h3>
          <div class="old">Chrome + Extensions</div>
          <div class="new">✓ Pure Rust browser with built-in everything</div>
          <div class="savings">Save: Privacy + $0 (but priceless)</div>
        </div>
        <div class="replacement-card">
          <h3>Password Manager</h3>
          <div class="old">LastPass Pro ($36/year)</div>
          <div class="new">✓ Built-in vault with Tailscale sync</div>
          <div class="savings">Save: $36/year</div>
        </div>
        <div class="replacement-card">
          <h3>API Testing</h3>
          <div class="old">Postman Pro ($180/year)</div>
          <div class="new">✓ Built-in REST client</div>
          <div class="savings">Save: $180/year</div>
        </div>
        <div class="replacement-card">
          <h3>PDF Editor</h3>
          <div class="old">Adobe Acrobat ($240/year)</div>
          <div class="new">✓ Native PDF viewer/editor</div>
          <div class="savings">Save: $240/year</div>
        </div>
        <div class="replacement-card">
          <h3>Office Suite</h3>
          <div class="old">Microsoft 365 ($100/year)</div>
          <div class="new">✓ DOCX, XLSX, PPTX viewers</div>
          <div class="savings">Save: $100/year</div>
        </div>
        <div class="replacement-card">
          <h3>Ad Blocker</h3>
          <div class="old">uBlock Origin + Donations</div>
          <div class="new">✓ Native ad blocking</div>
          <div class="savings">Save: Your sanity</div>
        </div>
        <div class="replacement-card">
          <h3>User Scripts</h3>
          <div class="old">Tampermonkey + Scripts</div>
          <div class="new">✓ Built-in script engine</div>
          <div class="savings">Save: Security risks</div>
        </div>
        <div class="replacement-card">
          <h3>Developer Tools</h3>
          <div class="old">Chrome DevTools + Extensions</div>
          <div class="new">✓ Full DevTools suite</div>
          <div class="savings">Save: Context switching</div>
        </div>
      </div>
      <div style="text-align: center; margin-top: 40px; font-size: 1.5rem; color: #ffd93d;">
        <strong>Total Savings: $15,000+/year</strong> in replaced software
      </div>
    </div>
  </section>

  <!-- File Formats -->
  <section class="formats">
    <div class="container">
      <h2>200+ File Formats Supported</h2>
      
      <div class="format-category" onclick="toggleCategory(this)">
        <div class="format-category-header">
          <h3>📄 Documents</h3>
          <span>▼</span>
        </div>
        <div class="format-category-content">
          <div class="format-list">
            <span class="format-tag">PDF</span>
            <span class="format-tag">DOCX</span>
            <span class="format-tag">DOC</span>
            <span class="format-tag">ODT</span>
            <span class="format-tag">RTF</span>
            <span class="format-tag">TXT</span>
            <span class="format-tag">MD</span>
            <span class="format-tag">EPUB</span>
            <span class="format-tag">MOBI</span>
            <span class="format-tag">AZW3</span>
            <span class="format-tag">FB2</span>
            <span class="format-tag">CBR</span>
            <span class="format-tag">CBZ</span>
          </div>
        </div>
      </div>

      <div class="format-category" onclick="toggleCategory(this)">
        <div class="format-category-header">
          <h3>📊 Spreadsheets</h3>
          <span>▼</span>
        </div>
        <div class="format-category-content">
          <div class="format-list">
            <span class="format-tag">XLSX</span>
            <span class="format-tag">XLS</span>
            <span class="format-tag">ODS</span>
            <span class="format-tag">CSV</span>
            <span class="format-tag">TSV</span>
            <span class="format-tag">XLSM</span>
            <span class="format-tag">XLSB</span>
          </div>
        </div>
      </div>

      <div class="format-category" onclick="toggleCategory(this)">
        <div class="format-category-header">
          <h3>🖼️ Images</h3>
          <span>▼</span>
        </div>
        <div class="format-category-content">
          <div class="format-list">
            <span class="format-tag">PNG</span>
            <span class="format-tag">JPG</span>
            <span class="format-tag">JPEG</span>
            <span class="format-tag">GIF</span>
            <span class="format-tag">WebP</span>
            <span class="format-tag">SVG</span>
            <span class="format-tag">BMP</span>
            <span class="format-tag">ICO</span>
            <span class="format-tag">TIFF</span>
            <span class="format-tag">PSD</span>
            <span class="format-tag">RAW</span>
            <span class="format-tag">CR2</span>
            <span class="format-tag">NEF</span>
            <span class="format-tag">ARW</span>
            <span class="format-tag">DNG</span>
            <span class="format-tag">HEIC</span>
            <span class="format-tag">AVIF</span>
            <span class="format-tag">JXL</span>
          </div>
        </div>
      </div>

      <div class="format-category" onclick="toggleCategory(this)">
        <div class="format-category-header">
          <h3>🎵 Audio</h3>
          <span>▼</span>
        </div>
        <div class="format-category-content">
          <div class="format-list">
            <span class="format-tag">MP3</span>
            <span class="format-tag">WAV</span>
            <span class="format-tag">FLAC</span>
            <span class="format-tag">OGG</span>
            <span class="format-tag">M4A</span>
            <span class="format-tag">AAC</span>
            <span class="format-tag">WMA</span>
            <span class="format-tag">OPUS</span>
            <span class="format-tag">APE</span>
            <span class="format-tag">WV</span>
          </div>
        </div>
      </div>

      <div class="format-category" onclick="toggleCategory(this)">
        <div class="format-category-header">
          <h3>🎬 Video</h3>
          <span>▼</span>
        </div>
        <div class="format-category-content">
          <div class="format-list">
            <span class="format-tag">MP4</span>
            <span class="format-tag">WebM</span>
            <span class="format-tag">AVI</span>
            <span class="format-tag">MKV</span>
            <span class="format-tag">MOV</span>
            <span class="format-tag">WMV</span>
            <span class="format-tag">FLV</span>
            <span class="format-tag">OGV</span>
            <span class="format-tag">M4V</span>
            <span class="format-tag">3GP</span>
          </div>
        </div>
      </div>

      <div class="format-category" onclick="toggleCategory(this)">
        <div class="format-category-header">
          <h3>📦 Archives</h3>
          <span>▼</span>
        </div>
        <div class="format-category-content">
          <div class="format-list">
            <span class="format-tag">ZIP</span>
            <span class="format-tag">RAR</span>
            <span class="format-tag">7Z</span>
            <span class="format-tag">TAR</span>
            <span class="format-tag">GZ</span>
            <span class="format-tag">BZ2</span>
            <span class="format-tag">XZ</span>
            <span class="format-tag">TAR.GZ</span>
            <span class="format-tag">TAR.BZ2</span>
            <span class="format-tag">TAR.XZ</span>
          </div>
        </div>
      </div>

      <div class="format-category" onclick="toggleCategory(this)">
        <div class="format-category-header">
          <h3>💻 Code</h3>
          <span>▼</span>
        </div>
        <div class="format-category-content">
          <div class="format-list">
            <span class="format-tag">JS</span>
            <span class="format-tag">TS</span>
            <span class="format-tag">PY</span>
            <span class="format-tag">RS</span>
            <span class="format-tag">GO</span>
            <span class="format-tag">C</span>
            <span class="format-tag">CPP</span>
            <span class="format-tag">JAVA</span>
            <span class="format-tag">CS</span>
            <span class="format-tag">PHP</span>
            <span class="format-tag">RB</span>
            <span class="format-tag">SWIFT</span>
            <span class="format-tag">KT</span>
            <span class="format-tag">JSON</span>
            <span class="format-tag">XML</span>
            <span class="format-tag">YAML</span>
            <span class="format-tag">TOML</span>
            <span class="format-tag">INI</span>
            <span class="format-tag">SQL</span>
            <span class="format-tag">SH</span>
            <span class="format-tag">PS1</span>
          </div>
        </div>
      </div>

      <div class="format-category" onclick="toggleCategory(this)">
        <div class="format-category-header">
          <h3>🔬 Scientific</h3>
          <span>▼</span>
        </div>
        <div class="format-category-content">
          <div class="format-list">
            <span class="format-tag">PDB</span>
            <span class="format-tag">MOL</span>
            <span class="format-tag">MOL2</span>
            <span class="format-tag">SDF</span>
            <span class="format-tag">XYZ</span>
            <span class="format-tag">CIF</span>
            <span class="format-tag">MMCIF</span>
          </div>
        </div>
      </div>

      <div class="format-category" onclick="toggleCategory(this)">
        <div class="format-category-header">
          <h3>🎨 3D Models</h3>
          <span>▼</span>
        </div>
        <div class="format-category-content">
          <div class="format-list">
            <span class="format-tag">OBJ</span>
            <span class="format-tag">STL</span>
            <span class="format-tag">GLTF</span>
            <span class="format-tag">GLB</span>
            <span class="format-tag">PLY</span>
            <span class="format-tag">FBX</span>
            <span class="format-tag">DAE</span>
            <span class="format-tag">3DS</span>
          </div>
        </div>
      </div>

      <div class="format-category" onclick="toggleCategory(this)">
        <div class="format-category-header">
          <h3>🔤 Fonts</h3>
          <span>▼</span>
        </div>
        <div class="format-category-content">
          <div class="format-list">
            <span class="format-tag">TTF</span>
            <span class="format-tag">OTF</span>
            <span class="format-tag">WOFF</span>
            <span class="format-tag">WOFF2</span>
            <span class="format-tag">EOT</span>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Security Architecture -->
  <section class="security">
    <div class="container">
      <h2>4-Layer Security Sandbox</h2>
      <div class="security-layers">
        <div class="security-layer" data-layer="Layer 1">
          <h3>Network Sandbox</h3>
          <p>All web content quarantined in memory. No direct disk access. No phone-home telemetry.</p>
        </div>
        <div class="security-layer" data-layer="Layer 2">
          <h3>Render Sandbox</h3>
          <p>Custom SassyScript engine. No V8 JIT exploits. No Chrome vulnerabilities.</p>
        </div>
        <div class="security-layer" data-layer="Layer 3">
          <h3>Content Sandbox</h3>
          <p>Images, fonts, media decoded in pure Rust. No native codec vulnerabilities.</p>
        </div>
        <div class="security-layer" data-layer="Layer 4">
          <h3>Download Quarantine</h3>
          <p>Files held in memory until explicitly released. 3 confirmations required.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- Features -->
  <section class="features">
    <div class="container">
      <h2>Killer Features</h2>
      <div class="feature-grid">
        <div class="feature-card">
          <h3>Everyday Mode</h3>
          <p>Clean, simple interface for non-technical users. Technical jargon translated to plain English. Your grandma can use this.</p>
          <span class="badge">DEFAULT</span>
        </div>
        <div class="feature-card">
          <h3>Hunter Mode</h3>
          <p>Active anti-tracking warfare. Corrupts tracker payloads, mutates tokens, floods entropy. Make trackers cry.</p>
          <span class="badge">ADVANCED</span>
        </div>
        <div class="feature-card">
          <h3>Web3 Education</h3>
          <p>Gentle onboarding for crypto/Web3. Plain English explanations, scam warnings, guided tooltips. No more rug pulls.</p>
          <span class="badge">NEW</span>
        </div>
        <div class="feature-card">
          <h3>Built-in DevTools</h3>
          <p>Full developer tools suite: Elements inspector, Console, Network waterfall, REST client. VS Code is a sandcastle.</p>
          <span class="badge">DEVELOPER</span>
        </div>
        <div class="feature-card">
          <h3>MCP AI Integration</h3>
          <p>Multi-agent AI for automation. Grok understands, Manus orchestrates, Claude codes. The future of browsing.</p>
          <span class="badge">AI-POWERED</span>
        </div>
        <div class="feature-card">
          <h3>Family Profiles</h3>
          <p>Adult, Teen, Kid profiles with time limits and content filtering. Parental controls that actually work.</p>
          <span class="badge">FAMILY-SAFE</span>
        </div>
      </div>
    </div>
  </section>

  <!-- FAQ -->
  <section class="faq">
    <div class="container">
      <h2>Questions from Everyday Users</h2>
      
      <div class="faq-item" onclick="toggleFAQ(this)">
        <div class="faq-question">
          <span>Is this really free?</span>
          <span>+</span>
        </div>
        <div class="faq-answer">
          <p>Yes! Sassy Browser is 100% free for personal use. We make money from enterprise licenses and optional cloud sync features. No ads, no tracking, no BS.</p>
        </div>
      </div>

      <div class="faq-item" onclick="toggleFAQ(this)">
        <div class="faq-question">
          <span>Why should I trust a new browser?</span>
          <span>+</span>
        </div>
        <div class="faq-answer">
          <p>Great question! Unlike Chrome (Google tracking) or Edge (Microsoft telemetry), Sassy Browser is 100% open source, written in Rust (memory-safe), and has zero telemetry. You can audit every line of code.</p>
        </div>
      </div>

      <div class="faq-item" onclick="toggleFAQ(this)">
        <div class="faq-question">
          <span>Will my favorite websites work?</span>
          <span>+</span>
        </div>
        <div class="faq-answer">
          <p>Yes! Sassy Browser supports all modern web standards. If a site works in Chrome, it works in Sassy. Plus, you get built-in ad blocking and tracker protection.</p>
        </div>
      </div>

      <div class="faq-item" onclick="toggleFAQ(this)">
        <div class="faq-question">
          <span>What's "Everyday Mode"?</span>
          <span>+</span>
        </div>
        <div class="faq-answer">
          <p>Everyday Mode is our default interface designed for non-technical users. All the complex features are hidden, technical terms are translated to plain English, and everything "just works". You can switch to Developer or Advanced mode anytime.</p>
        </div>
      </div>

      <div class="faq-item" onclick="toggleFAQ(this)">
        <div class="faq-question">
          <span>How does it replace so many paid apps?</span>
          <span>+</span>
        </div>
        <div class="faq-answer">
          <p>Instead of installing 20 different apps (PDF reader, password manager, ad blocker, etc.), Sassy Browser has everything built-in. Open any file type directly in the browser. No more "download this app to view this file" nonsense.</p>
        </div>
      </div>

      <div class="faq-item" onclick="toggleFAQ(this)">
        <div class="faq-question">
          <span>Is my data safe?</span>
          <span>+</span>
        </div>
        <div class="faq-answer">
          <p>Absolutely! Your data never leaves your device unless you explicitly enable sync (via Tailscale, not our servers). Passwords are encrypted with military-grade encryption. The 4-layer sandbox protects you from malicious websites.</p>
        </div>
      </div>

      <div class="faq-item" onclick="toggleFAQ(this)">
        <div class="faq-question">
          <span>What about Chrome extensions?</span>
          <span>+</span>
        </div>
        <div class="faq-answer">
          <p>Most popular extensions are built-in: ad blocker (uBlock Origin equivalent), password manager (LastPass killer), user scripts (Tampermonkey replacement). For others, we're building a compatibility layer.</p>
        </div>
      </div>

      <div class="faq-item" onclick="toggleFAQ(this)">
        <div class="faq-question">
          <span>Can I import my bookmarks and passwords?</span>
          <span>+</span>
        </div>
        <div class="faq-answer">
          <p>Yes! One-click import from Chrome, Firefox, Safari, Edge, and all major password managers. Your transition will be seamless.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- Footer CTA -->
  <section class="footer-cta" id="waitlist">
    <div class="container">
      <h2>Ready to Save $15,000/Year?</h2>
      <p>Join 50,000+ users ditching subscriptions for good.</p>
      <a href="https://forms.gle/your-waitlist-form" class="cta">Join the Waitlist</a>
    </div>
  </section>

  <script>
    function toggleCategory(element) {
      element.classList.toggle('open');
    }
    
    function toggleFAQ(element) {
      element.classList.toggle('open');
      const icon = element.querySelector('.faq-question span:last-child');
      icon.textContent = element.classList.contains('open') ? '−' : '+';
    }
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html;charset=UTF-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}