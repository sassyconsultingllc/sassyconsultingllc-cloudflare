/**
 * Sassy Browser Glossary System
 * Adds blue squiggly underlines to technical terms with hover/click tooltips
 * 
 * Usage: Add class="term" and data-term="term-key" to any element
 * Example: <span class="term" data-term="rust">Rust</span>
 */

const glossary = {
    // Programming & Technology
    "rust": {
        title: "Rust",
        definition: "A systems programming language focused on safety, speed, and concurrency. It prevents common bugs like memory leaks without using garbage collection.",
        source: "rust-lang.org",
        url: "https://www.rust-lang.org/"
    },
    "sandbox": {
        title: "Sandbox",
        definition: "An isolated environment where programs run with restricted permissions. If something malicious happens inside, it can't affect the rest of your computer.",
        source: "Wikipedia",
        url: "https://en.wikipedia.org/wiki/Sandbox_(computer_security)"
    },
    "telemetry": {
        title: "Telemetry",
        definition: "Data about how you use software that gets sent back to the company. This often includes browsing history, clicks, and other usage patterns.",
        source: "Mozilla",
        url: "https://support.mozilla.org/en-US/kb/telemetry-clientid"
    },
    "chromium": {
        title: "Chromium",
        definition: "Google's open-source browser engine. Chrome, Edge, Brave, and Opera are all based on it—meaning they all share Google's code and many privacy concerns.",
        source: "chromium.org",
        url: "https://www.chromium.org/"
    },
    "v8": {
        title: "V8 JavaScript Engine",
        definition: "Google's JavaScript engine used in Chrome. It uses JIT compilation which is fast but historically has been a major source of security vulnerabilities.",
        source: "v8.dev",
        url: "https://v8.dev/"
    },
    "jit": {
        title: "JIT (Just-In-Time) Compilation",
        definition: "A technique that compiles code while the program runs for better speed. Unfortunately, it's a common attack vector—hackers exploit JIT compilers to run malicious code.",
        source: "OWASP",
        url: "https://owasp.org/www-community/attacks/JIT_Spraying"
    },

    // Encryption & Security
    "chacha20": {
        title: "ChaCha20-Poly1305",
        definition: "A modern encryption algorithm used by WireGuard VPN, Google, and Cloudflare. It's faster than AES on devices without hardware acceleration and is considered extremely secure.",
        source: "IETF RFC 8439",
        url: "https://datatracker.ietf.org/doc/html/rfc8439"
    },
    "ed25519": {
        title: "Ed25519",
        definition: "A digital signature algorithm used by Signal, SSH, and Tor. It creates unforgeable signatures that prove you are who you say you are—without revealing your private key.",
        source: "ed25519.cr.yp.to",
        url: "https://ed25519.cr.yp.to/"
    },
    "argon2": {
        title: "Argon2id",
        definition: "Winner of the Password Hashing Competition. It's the recommended way to store passwords because it's deliberately slow and memory-hard, making brute-force attacks impractical.",
        source: "OWASP",
        url: "https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html"
    },
    "entropy": {
        title: "Entropy",
        definition: "Randomness collected from unpredictable sources (mouse movements, key timing). Good entropy is essential for generating secure encryption keys that can't be guessed.",
        source: "Wikipedia",
        url: "https://en.wikipedia.org/wiki/Entropy_(computing)"
    },
    "e2e": {
        title: "End-to-End Encryption",
        definition: "Encryption where only you and the recipient can read messages. Not even the service provider can decrypt your data—they only see encrypted gibberish.",
        source: "EFF",
        url: "https://ssd.eff.org/module/communicating-others#end-to-end-encryption"
    },

    // Networking
    "tailscale": {
        title: "Tailscale",
        definition: "A mesh VPN that connects your devices directly to each other without going through a central server. Your data never touches Tailscale's servers—it goes device-to-device.",
        source: "tailscale.com",
        url: "https://tailscale.com/kb/1151/what-is-tailscale"
    },
    "oauth": {
        title: "OAuth",
        definition: "A secure way to log into websites using another account (like 'Sign in with Google'). It lets you authenticate without giving the website your actual password.",
        source: "oauth.net",
        url: "https://oauth.net/2/"
    },
    "captcha": {
        title: "CAPTCHA",
        definition: "Those 'select all the traffic lights' puzzles. They verify you're human, not a bot. Some CAPTCHAs also track you, which is why Sassy's popup blocker allows them while blocking other popups.",
        source: "Wikipedia",
        url: "https://en.wikipedia.org/wiki/CAPTCHA"
    },

    // Browser Security
    "clickjacking": {
        title: "Clickjacking",
        definition: "An attack where invisible buttons are placed over legitimate ones. You think you're clicking 'Play Video' but you're actually clicking 'Transfer $1000'. Sassy blocks elements under 20x20px to prevent this.",
        source: "OWASP",
        url: "https://owasp.org/www-community/attacks/Clickjacking"
    },
    "quarantine": {
        title: "Download Quarantine",
        definition: "Downloaded files are held in memory (not saved to disk) until you explicitly approve them multiple times. This prevents drive-by downloads from installing malware.",
        source: "Sassy Browser",
        url: "#"
    },
    "malware": {
        title: "Malware",
        definition: "Software designed to harm your computer or steal your data. Includes viruses, ransomware, spyware, and trojans. Often installed accidentally through deceptive downloads or popups.",
        source: "CISA",
        url: "https://www.cisa.gov/news-events/news/what-malware"
    },
    "nsfw": {
        title: "NSFW Detection",
        definition: "Automatic detection of adult content using image analysis. In Sassy Browser, NSFW pages are excluded from history and sync to protect your privacy (and your kids).",
        source: "Sassy Browser",
        url: "#"
    },

    // File Formats
    "pdb": {
        title: "PDB (Protein Data Bank)",
        definition: "A file format for 3D molecular structures—proteins, DNA, drugs. Used by researchers worldwide. Normally requires expensive software like ChemDraw ($2,600/yr) to view.",
        source: "RCSB PDB",
        url: "https://www.rcsb.org/"
    },
    "raw": {
        title: "RAW Image Files",
        definition: "Unprocessed image data straight from your camera sensor. Contains much more detail than JPEG but requires special software to view. Sassy opens CR2, NEF, ARW, DNG, and more.",
        source: "Wikipedia",
        url: "https://en.wikipedia.org/wiki/Raw_image_format"
    },
    "dicom": {
        title: "DICOM",
        definition: "The standard format for medical images (X-rays, MRIs, CT scans). Viewing software (PACS viewers) typically costs thousands of dollars for hospitals.",
        source: "DICOM Standard",
        url: "https://www.dicomstandard.org/"
    }
};

// Initialize tooltips when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    const terms = document.querySelectorAll('.term');
    
    terms.forEach(term => {
        const key = term.getAttribute('data-term');
        const entry = glossary[key];
        
        if (!entry) {
            console.warn(`Glossary entry not found for: ${key}`);
            return;
        }
        
        // Create tooltip element
        const tooltip = document.createElement('div');
        tooltip.className = 'term-tooltip';
        tooltip.innerHTML = `
            <strong>${entry.title}</strong>
            <p>${entry.definition}</p>
            <span class="term-source">
                Source: <a href="${entry.url}" target="_blank" rel="noopener">${entry.source}</a>
            </span>
        `;
        
        term.appendChild(tooltip);
        
        // Make focusable for accessibility
        term.setAttribute('tabindex', '0');
        term.setAttribute('role', 'button');
        term.setAttribute('aria-label', `Learn about ${entry.title}`);
    });
});

// Add CSS for terms if not already present
const style = document.createElement('style');
style.textContent = `
    .term {
        position: relative;
        cursor: help;
        text-decoration: underline;
        text-decoration-style: wavy;
        text-decoration-color: #3b82f6;
        text-underline-offset: 3px;
    }
    .term:hover { color: #3b82f6; }
    .term-tooltip {
        position: absolute;
        bottom: calc(100% + 10px);
        left: 50%;
        transform: translateX(-50%);
        background: #1a1a1a;
        border: 1px solid #3b82f6;
        border-radius: 8px;
        padding: 12px 16px;
        width: 280px;
        opacity: 0;
        visibility: hidden;
        transition: all 0.2s ease;
        z-index: 1000;
        box-shadow: 0 4px 20px rgba(0,0,0,0.4);
        pointer-events: none;
    }
    .term:hover .term-tooltip,
    .term:focus .term-tooltip {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
    }
    .term-tooltip::after {
        content: '';
        position: absolute;
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        border: 8px solid transparent;
        border-top-color: #3b82f6;
    }
    .term-tooltip strong {
        display: block;
        color: #3b82f6;
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 6px;
    }
    .term-tooltip p {
        color: #a0a0a0;
        font-size: 0.85rem;
        line-height: 1.5;
        margin: 0;
    }
    .term-tooltip .term-source {
        display: block;
        margin-top: 8px;
        font-size: 0.7rem;
        color: #606060;
    }
    .term-tooltip .term-source a {
        color: #3b82f6;
        text-decoration: none;
    }
    @media (max-width: 768px) {
        .term-tooltip {
            width: 240px;
            left: 0;
            transform: none;
        }
        .term-tooltip::after { left: 20px; }
    }
`;
document.head.appendChild(style);
