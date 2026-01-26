# Sassy Browser Website Updates Required
## Analysis: 2026-01-22

---

## Current Website vs Reality

| Metric | Website Claims | Actual Codebase |
|--------|---------------|-----------------|
| Lines of Rust | 17,267 | **50,818** |
| Source Files | ~40 implied | **93** |
| Version | v1.0 | **v2.0.0** |
| File Formats | "supports many" | **100+ documented** |
| Focus | Security-only | **Universal file editor + browser** |

---

## Key Messaging Changes Needed

### OLD Positioning (browser.html):
> "One browser for complete protection"
> "Internet Safety. Finally..."
> Focus: Security, sandbox, trust system

### NEW Positioning (v2.0):
> "The Browser That Kills $15,000/year in Software Subscriptions"
> "100+ File Formats. Zero Paid Dependencies. No Chrome. No Google."
> Focus: **Universal file viewer/editor** that also happens to be a secure internet browser

---

## Missing Feature Sections

The current website completely misses the DISRUPTOR value proposition:

### 1. Software Replacement Value ($15,248/year)
- Adobe Photoshop → Image Editor (PSD, RAW, adjustments, filters)
- Adobe Lightroom → RAW Processing (CR2, NEF, ARW, DNG)
- Adobe Acrobat Pro → PDF Editor (annotate, highlight, export)
- Microsoft 365 → Document Editor (DOCX, XLSX editing)
- ChemDraw → Molecular Viewer (PDB, MOL 3D)
- PACS Viewers → DICOM support
- AutoCAD LT → DXF viewer
- Postman Pro → Built-in REST client
- WinRAR → Archive support

### 2. Full Editing Capabilities
Website says "viewer" but we now have EDITORS:
- Image Editor: crop, resize, rotate, filters, adjustments, save
- Document Editor: rich text formatting, styles, export
- PDF Annotations: highlight, notes, search
- Spreadsheet: formula bar, cell editing

### 3. Format Count
Website vague about formats. Reality:
- 25+ image formats (including RAW)
- 6 document formats
- 5 spreadsheet formats
- 7+ chemical/scientific formats
- 8 archive formats
- 8+ 3D model formats
- 5 font formats
- 9 audio formats
- 9 video formats
- 5 ebook formats
- 200+ code languages

### 4. AI Integration
Not mentioned at all on website:
- 4-agent MCP system
- Claude + xAI support
- Sandboxed file access
- Git integration
- Voice input via Whisper

---

## Technical Updates Needed

### Stats to Update:
```
OLD:  17,267 lines of Rust
NEW:  50,818 lines of Rust

OLD:  ~40 files implied
NEW:  93 source files

OLD:  v1.0 — Built Winter 2025
NEW:  v2.0.0 — 50,000+ lines of Pure Rust

OLD:  12 MB install
NEW:  ~20 MB with all viewers
```

### Cargo.toml Highlights to Add:
- eframe 0.29 (Pure Rust GUI)
- 40+ Pure Rust dependencies
- Zero Chrome/Google dependencies
- Full image processing stack
- PDF creation + editing
- Document parsing

---

## Files Created

1. **browser-v2.html** - Complete new landing page with:
   - Updated stats (50,818 lines, 93 files, 100+ formats)
   - Software replacement table with pricing
   - Format grid with capabilities (view/edit/save/print)
   - Feature cards for all major features
   - Pure Rust tech stack callout
   - Proper download CTAs

---

## Deployment Steps

1. Review browser-v2.html locally
2. Replace browser.html with browser-v2.html content
3. Update WEBSITE-UPDATES.md in sassy-browser-FIXED
4. Push to Cloudflare Pages
5. Test all links

---

## Additional Recommendations

### 1. Add Screenshots
- Image editor with RAW photo
- Molecular viewer with PDB
- PDF with annotations
- Document editing
- REST client in action

### 2. Add Demo Video
- 60-second "open everything" demo
- Show editing, not just viewing
- Emphasize zero-cost savings

### 3. SEO Meta Tags
Already added to browser-v2.html:
- Keywords: PDF editor, PDB viewer, Chrome alternative, etc.
- Description emphasizes free + formats + no subscriptions

### 4. Consider Dedicated Pages
- /formats - Full format documentation
- /vs-adobe - Direct comparison
- /vs-chrome - Security comparison
- /for-scientists - PDB/MOL focus
- /for-developers - REST client + code viewer
