# Fathom — PDF Tools

A free, private PDF toolkit built with plain HTML, CSS, and JavaScript. Everything
runs client-side in the browser using [pdf-lib](https://pdf-lib.js.org/),
[pdf.js](https://mozilla.github.io/pdf.js/), and [JSZip](https://stuk.github.io/jszip/) —
no file is ever uploaded to a server.

## How to use it

**Option 1 — just open it.** Double-click `index.html`. It works straight from your
file system (no build step, no install).

**Option 2 — host it.** Upload all three files (`index.html`, `style.css`,
`script.js`) to any static host (GitHub Pages, Netlify, Vercel, or your own server).

> **Note:** an internet connection is required the *first* time the page loads, because
> the three helper libraries are loaded from a CDN (cdnjs). No file you process ever
> leaves your device — only the (empty) library code is fetched.

## The nine tools

| Tool | What it does |
|---|---|
| Merge PDFs | Combine multiple PDFs into one, in the order you choose |
| Organize Pages | Reorder, rotate, delete, or extract pages via a thumbnail grid |
| Split PDF | Break a PDF into smaller files by page range, interval, or per-page |
| Compress PDF | Rebuild pages as optimized JPEGs to shrink file size |
| Images to PDF | Turn a batch of photos/scans into one PDF |
| PDF to Images | Export every page as a PNG or JPG |
| PDF to Text | Pull the plain text out of a PDF |
| Add Watermark | Stamp diagonal or tiled text across every page |
| Add Page Numbers | Number every page, in the position/format you pick |

## A note on Compress

Compress works by redrawing each page as a JPEG image, which shrinks file size well
for scanned or image-heavy PDFs — but the resulting text is no longer selectable or
searchable. For a text-only PDF that's already small, compression may not help much
(the tool tells you when that happens instead of pretending otherwise).

## Customizing

Colors, fonts, and spacing all live at the top of `style.css` as CSS custom
properties (`:root { --aqua: ...; --navy-black: ...; }`), so re-theming doesn't
require touching the rest of the file. Each tool's logic lives in its own clearly
labeled section of `script.js`.
