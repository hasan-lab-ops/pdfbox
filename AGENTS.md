# AGENTS.md

## Project

Static client-side PDF toolkit. No build system, no bundler, no package.json. Open `index.html` directly or serve with any static file server.

## Structure

- `index.html` — entry point, all CDN library imports
- `js/main.js` — routing, UI, file handling, auth (mock/localStorage)
- `js/pdf-tools.js` — converter classes + legacy PDF operations
- `js/tool-content.js` — SEO article content
- `css/styles.css` — all styling

## Key Gotchas

- **CDN-only dependencies** — versions pinned in index.html script/link tags. Do not add npm packages; this project has no package manager.
- **docx library loads as ESM** (type="module" script tag) — it's assigned to `window.docx`. Access it via `window.docx` or the `docxReady` promise, not a UMD global.
- **WordToPDFConverter** — html2canvas requires the temp container to be rendered in the DOM. Use `opacity: 0.01` + `z-index: -9999`, never `display: none` or `left: -9999px` or the PDF will be blank.
- **PDF encryption** uses `pdfDoc.save({ userPassword, ownerPassword, permissions })` — not a separate encrypt call.
- **Watermark** tiles diagonally across the full page using nested loops. Single-position watermark was a known bug.
- **Auth is fake** — stored in localStorage, no backend. Never treat it as real security.
- `.agents/skills/pdf/` is a Python-based skill (pypdf, reportlab, pdfplumber). It does NOT apply to this JavaScript codebase.

## Commands

```
# Serve locally (pick one)
npx serve .
python -m http.server 8000
# Then open http://localhost:8000
```

No lint, typecheck, test, or build commands exist. Verify manually in browser console (F12).
