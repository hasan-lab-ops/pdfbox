# PROJECT_MAP.md — PDFBox (pdfbox.online)
Generated: 2026-07-14

## TECH_STACK

| Library | CDN Version | Latest Stable (Jul 2026) | Status |
|---------|------------|--------------------------|--------|
| pdf.js | 6.1.200 | 6.1.200 | CURRENT |
| pdf-lib | 1.17.1 | 1.17.1 | CURRENT |
| jsPDF | REMOVED | 4.2.1 | REMOVED (bundled in html2pdf.js 0.14.0) |
| html2canvas | 1.4.1 | 1.4.1 | CURRENT |
| html2pdf.js | 0.14.0 | 0.14.0 | CURRENT |
| docx (ESM) | 9.7.1 | 9.7.1 | CURRENT |
| mammoth.js | 1.6.0 | 1.6.0 | CURRENT |
| tesseract.js | 6.0.1 | 7.0.0 | CURRENT on cdnjs (v7.0.0 only on GitHub) |
| JSZip | 3.10.1 | 3.10.1 | CURRENT |
| Lucide | latest | latest | CURRENT |

## SYSTEM_FLOW

```
index.html (CDN scripts + SPA shell)
  ├── css/styles.css (all styling)
  └── js/
       ├── main.js        (routing, UI, file upload, auth)
       ├── pdf-tools.js   (ALL conversion classes + helpers + orchestrator)
       └── tool-content.js (SEO article content)

User Flow:
  1. User selects tool from grid → hash route #tool?id=<tool-id>
  2. main.js renders tool detail page with file input + options
  3. User uploads file → handleFiles() stores in state
  4. User clicks convert → processConversion(toolId)
  5. Routes to: PDFToWordConverter | WordToPDFConverter | PDFEncryptor | PDFDecryptor
  6. Returns Blob → downloadFile() triggers browser download
```

## ARCHITECTURE

```
pdf-tools.js (1365 lines — SINGLE FILE, all conversion logic)
  │
  ├── PDFToWordConverter (lines 18-752)
  │     ├── getDocxLib() — lazy-load docx ESM from CDN
  │     ├── convert(file) — main entry
  │     ├── extractRawItems(textContent) — pdf.js item enrichment
  │     ├── detectColumns(items, pageWidth) — X-position clustering
  │     ├── groupIntoLines(items) — hasEOL + Y-proximity grouping
  │     ├── sortLineItems(items) — mixed RTL/LTR segment detection
  │     ├── formatLine(items) — gap-aware word assembly
  │     ├── groupLinesIntoParagraphs(lines) — script-change breaks
  │     ├── detectParagraphAlignment(lines) — edge variance analysis
  │     ├── buildParagraphFromLines(lines) — paragraph object assembly
  │     ├── extractTextFromPage(page) — full pipeline orchestrator
  │     ├── performOcrOnPage(page) — Tesseract.js v6 createWorker API
  │     ├── createWordContent(pageContent, docxLib) — DOCX generation
  │     └── detectTextDirection / isArabicTextSuspect — Unicode analysis
  │
  ├── WordToPDFConverter (lines 758-847)
  │     ├── convert(file) — Mammoth → off-screen div → html2pdf.js
  │     └── readFile(file) — FileReader utility
  │
  ├── PDFEncryptor (lines 856-930) — pdf-lib password protection
  ├── PDFDecryptor (lines 936-990) — pdf-lib decryption
  │
  ├── Helper Functions (lines 992-1003)
  │     ├── showLoading / hideLoading — UI indicator
  │     └── downloadFile — Blob → <a> click
  │
  ├── processConversion() (lines 1009-1103) — main orchestrator switch
  │
  └── Legacy Functions (lines 1105-1365)
        ├── processPDF() — orchestrator for legacy tools (called from main.js)
        ├── mergePDFs, extractPages, compressPDF
        ├── rotatePDF, deletePages, watermarkPDF
        ├── jpgToPdf, pdfToJpg
        ├── fileToBuffer, downloadBlob — legacy utilities
        └── parsePageRange — shared helper
```

## ORPHANS & PENDING

### Known Bugs
1. **PDF→Word bilingual formatting** — English+Arabic paragraphs merge; script-change detection fixed with diagnostic logging; needs user validation
2. **Word→PDF blank page** — position:fixed + opacity:1 + left:-9999px approach applied; needs user validation

### Technical Debt
- No unit tests, no build system, no linting
- `window.processPDF` legacy orchestrator still used by main.js:329 — could be consolidated with `processConversion`

### Resolved
- ~~pdf.js 2.16.105~~ → 6.1.200 ✅
- ~~jsPDF 2.5.1 standalone CDN~~ → REMOVED (bundled in html2pdf.js 0.14.0) ✅
- ~~html2pdf.js 0.10.1~~ → 0.14.0 ✅
- ~~docx 7.8.2~~ → 9.7.1 ✅
- ~~tesseract.js 5.0.4 (Tesseract.recognize)~~ → 6.0.1 (createWorker API) ✅
- ~~mockConversion()~~ → removed ✅
- ~~showToast() duplicate in pdf-tools.js~~ → removed ✅
- ~~CompatPDFDocument/CompatRgb/CompatDegrees~~ → removed ✅
- ~~protectPDF()/unlockPDF()~~ → removed (superseded by PDFEncryptor/PDFDecryptor classes) ✅
- ~~CSS `.nav-links` outside media query~~ → moved inside @media (max-width: 768px) ✅
