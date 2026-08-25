# AGENTS.md

## Project

pdfbox.online — a client-side PDF toolkit (static site) plus one Python
microservice for PDF → Word conversion.

## Structure

```
index.html            entry point, all CDN library imports
main.js               routing, UI, file handling, PDF-to-Word API client
style.css             main site styling
site-pages.css        styling for the text pages (about, blog, terms, …)
cookie-consent.js     cookie banner
articles/             blog articles (static HTML)
images/               icons / tool images

main.py               PDF→Word FastAPI microservice (pdf2docx)
requirements.txt      its dependencies
server.mjs            local dev server: static files + /convert,/health proxy → :8000

deploy/pdfbox.service            systemd unit for the API
deploy/nginx-api-pdfbox.conf     vhost for api.pdfbox.online
deploy/nginx-site-convert-snippet.conf  /convert + /health locations for the main vhost
deploy/SERVER_CLEANUP_CHECKLIST.md      step-by-step legacy-removal runbook
```

## Key gotchas

- **CDN-only frontend dependencies** — versions pinned in index.html script/link
  tags. No bundler, no package manager.
- **PDF → Word is server-side.** The frontend `pdfToWord()` posts the file to
  `/convert` (same origin; nginx proxies it to the API in production) or to
  `http://localhost:8000` when the page is opened from a local host.
- **`main.py` endpoint is a sync `def` on purpose** — the blocking pdf2docx
  work must run in FastAPI's thread pool, never on the async event loop.
  Uploads are read from `file.file` (the sync SpooledTemporaryFile);
  `UploadFile.read()` is async and will not work there.
- The conversion pool is bounded (`MAX_CONCURRENT_CONVERSIONS`) and has a hard
  timeout (`CONVERSION_TIMEOUT_SECONDS`). Don't re-introduce unbounded
  concurrency or fork-based `multi_processing=True` in pdf2docx.
- CORS defaults to `https://pdfbox.online` + `https://www.pdfbox.online` only.
  Local development overrides via the `ALLOWED_ORIGINS` env var (see
  start_dev.bat).
- **Auth on the site is fake** — localStorage only. Never treat it as real security.

## Commands

```bash
# API (development)
python -m venv venv && venv/bin/pip install -r requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 8000

# Full local site (static + API proxy on :3000)
node server.mjs            # after starting the API above
# or on Windows: start_dev.bat

# Smoke test
curl http://127.0.0.1:8000/health
curl -F "file=@doc.pdf;type=application/pdf" http://127.0.0.1:8000/convert -o out.docx
```

Production deployment: `deploy/pdfbox.service` (systemd) +
`deploy/nginx-api-pdfbox.conf` (api subdomain) +
`deploy/nginx-site-convert-snippet.conf` (main site).
Server-side legacy cleanup: `deploy/SERVER_CLEANUP_CHECKLIST.md`.

No lint, typecheck, test, or build commands exist. Verify manually
(browser console F12 / curl).
