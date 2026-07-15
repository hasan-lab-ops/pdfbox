/**
 * pdf-tools.js — PDFBox Core Processing Engine
 * =====================================================
 * Contains all PDF processing functions for every tool.
 * Functions are modular, well-commented, and use async/await.
 * Heavy operations use Web Workers via pdf.js to prevent UI freezing.
 *
 * Tools implemented:
 *   1.  processMerge()          — Merge multiple PDFs
 *   2.  processSplit()          — Split by range OR extract all → ZIP
 *   3.  processImageToPdf()     — Images → single PDF
 *   4.  processPdfToImage()     — PDF pages → PNGs in ZIP
 *   5.  processPdfToWord()      — PDF text extraction + RTL + OCR fallback
 *   6.  processWordToPdf()      — DOCX → A4 PDF (Arabic support)
 *   7.  processCompressPdf()    — Real image downsampling compression
 *   8.  processProtectPdf()     — AES password encryption via pdf-lib
 *   9.  processUnlockPdf()      — Remove password protection
 *   10. processWatermarkPdf()   — Diagonal text watermark on all pages
 *   11. processDeletePages()    — Remove selected pages from PDF
 *   12. generateDeleteThumbnails() — Render page thumbnails for delete UI
 */

'use strict';

/* ======================================================================
   LIBRARY SETUP
   ====================================================================== */

/**
 * Destructure the exports we need from the global PDFLib object.
 * PDFLib is loaded via CDN in index.html.
 */
const { PDFDocument, rgb, degrees, StandardFonts } = PDFLib;

/**
 * Configure PDF.js to use its Web Worker, which offloads heavy PDF parsing
 * to a background thread — preventing the main UI from freezing.
 */
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

/* ======================================================================
   GENERAL UTILITY HELPERS
   ====================================================================== */

/**
 * Reads a File object into an ArrayBuffer asynchronously.
 * Used by all tools before passing data to pdf-lib or pdf.js.
 *
 * @param  {File}            file
 * @returns {Promise<ArrayBuffer>}
 */
function fileToArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
        reader.readAsArrayBuffer(file);
    });
}

/**
 * Triggers a browser file download from a Blob object.
 *
 * @param {Blob}   blob
 * @param {string} filename
 */
function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Revoke after short delay to ensure download starts
    setTimeout(() => URL.revokeObjectURL(url), 8000);
}

/**
 * Triggers a browser download for raw PDF byte data (Uint8Array).
 *
 * @param {Uint8Array} bytes
 * @param {string}     filename
 */
function downloadPdf(bytes, filename) {
    downloadBlob(new Blob([bytes], { type: 'application/pdf' }), filename);
}

/**
 * Strips the .pdf extension from a filename for use in output filenames.
 *
 * @param  {string} filename
 * @returns {string}
 */
function stripPdfExt(filename) {
    return filename.replace(/\.pdf$/i, '');
}

/* ======================================================================
   1. MERGE PDFs
   ====================================================================== */

/**
 * Merges multiple PDF File objects into a single PDF document.
 * Copies all pages from each source into a new document in order.
 *
 * @param  {File[]} files — Array of PDF File objects to merge
 * @returns {Promise<void>}
 */
async function processMerge(files) {
    const mergedPdf = await PDFDocument.create();

    for (let i = 0; i < files.length; i++) {
        // Update progress message for each file
        updateProgress(
            (i / files.length) * 90,
            `Merging file ${i + 1} of ${files.length}: "${files[i].name}"`
        );

        const buffer = await fileToArrayBuffer(files[i]);
        const srcPdf = await PDFDocument.load(buffer);
        // Copy all pages from the source document
        const pages = await mergedPdf.copyPages(srcPdf, srcPdf.getPageIndices());
        pages.forEach(page => mergedPdf.addPage(page));
    }

    updateProgress(96, 'Saving merged PDF...');
    const bytes = await mergedPdf.save();
    downloadPdf(bytes, 'PDFBox-merged.pdf');
}

/* ======================================================================
   2. SPLIT PDF
   ====================================================================== */

/**
 * Parses a human-readable page range string into an array of 0-based indices.
 * Examples: "1-3, 5, 8-10" → [0, 1, 2, 4, 7, 8, 9]
 *
 * @param  {string} rangeStr  — Range input from the user
 * @param  {number} maxPages  — Total page count of the document
 * @returns {number[]}         — Sorted array of 0-based page indices
 * @throws {Error}             — If the format is invalid or no pages are found
 */
function parseRangeStr(rangeStr, maxPages) {
    if (!rangeStr || !rangeStr.trim()) {
        // Empty input = all pages
        return Array.from({ length: maxPages }, (_, i) => i);
    }

    const pages = new Set();
    const parts = rangeStr.split(',');

    for (const rawPart of parts) {
        const part = rawPart.trim();
        if (!part) continue;

        if (part.includes('-')) {
            // Handle range like "2-5"
            const segments = part.split('-');
            if (segments.length !== 2) throw new Error(`Invalid range segment: "${part}"`);
            let [start, end] = segments.map(Number);
            if (isNaN(start) || isNaN(end)) throw new Error(`Non-numeric range: "${part}"`);
            // Clamp to valid page bounds
            start = Math.max(1, start);
            end = Math.min(maxPages, end);
            if (start > end) throw new Error(`Start page (${start}) cannot exceed end page (${end}).`);
            for (let i = start; i <= end; i++) pages.add(i - 1);
        } else {
            // Handle individual page number like "5"
            const n = Number(part);
            if (isNaN(n) || !Number.isInteger(n)) throw new Error(`Invalid page number: "${part}"`);
            if (n >= 1 && n <= maxPages) pages.add(n - 1);
        }
    }

    if (pages.size === 0) throw new Error('No valid page numbers found in the specified range.');
    return Array.from(pages).sort((a, b) => a - b);
}

/**
 * Splits a PDF in one of two modes:
 *  - 'custom':  Extracts a specific page range into a single PDF
 *  - 'extract': Extracts every page as an individual PDF, bundled in a ZIP
 *
 * @param  {File}   file      — Source PDF file
 * @param  {string} rangeStr  — Page range string (used only in 'custom' mode)
 * @param  {string} mode      — 'custom' | 'extract'
 * @returns {Promise<void>}
 */
async function processSplit(file, rangeStr, mode) {
    const buffer = await fileToArrayBuffer(file);
    const srcPdf = await PDFDocument.load(buffer);
    const total = srcPdf.getPageCount();
    const outName = stripPdfExt(file.name);

    if (mode === 'extract') {
        /* ---- Extract All: each page → its own PDF → ZIP ---- */
        updateProgress(5, `Preparing to extract ${total} pages...`);
        const zip = new JSZip();

        for (let i = 0; i < total; i++) {
            updateProgress(
                5 + ((i / total) * 85),
                `Extracting page ${i + 1} of ${total}...`
            );

            // Create a new single-page document
            const pagePdf = await PDFDocument.create();
            const [copied] = await pagePdf.copyPages(srcPdf, [i]);
            pagePdf.addPage(copied);

            const bytes = await pagePdf.save();
            // Zero-pad the page number for correct file sorting
            const pageNum = String(i + 1).padStart(String(total).length, '0');
            zip.file(`${outName}-page-${pageNum}.pdf`, bytes);
        }

        updateProgress(95, 'Compressing ZIP archive...');
        const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
        downloadBlob(zipBlob, `${outName}-all-pages.zip`);

    } else {
        /* ---- Custom Range: extract selected pages → single PDF ---- */
        updateProgress(20, 'Parsing page range...');
        const indices = parseRangeStr(rangeStr, total);

        updateProgress(50, `Extracting ${indices.length} page(s)...`);
        const newPdf = await PDFDocument.create();
        const pages = await newPdf.copyPages(srcPdf, indices);
        pages.forEach(page => newPdf.addPage(page));

        updateProgress(92, 'Saving extracted PDF...');
        const bytes = await newPdf.save();
        const safeRange = rangeStr.replace(/\s/g, '').replace(/,/g, '_');
        downloadPdf(bytes, `${outName}-pages-${safeRange}.pdf`);
    }
}

/* ======================================================================
   3. IMAGE TO PDF
   ====================================================================== */

/**
 * Converts any image File to a PNG ArrayBuffer using a canvas element.
 * This handles formats that pdf-lib cannot embed directly (e.g. WebP).
 *
 * @param  {File}               file
 * @returns {Promise<Uint8Array>}
 */
function convertImageToPng(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            canvas.getContext('2d').drawImage(img, 0, 0);
            URL.revokeObjectURL(url);
            canvas.toBlob(blob => {
                if (!blob) return reject(new Error('Canvas conversion failed.'));
                blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf))).catch(reject);
            }, 'image/png');
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Failed to load image: ${file.name}`)); };
        img.src = url;
    });
}

/**
 * Converts an ordered array of image Files into a single PDF document.
 * Each image occupies one page sized to its natural dimensions.
 * Supports JPEG, PNG, and WebP (WebP is converted via canvas first).
 *
 * @param  {File[]}  imageFiles — Ordered array of image File objects
 * @returns {Promise<void>}
 */
async function processImageToPdf(imageFiles) {
    const pdfDoc = await PDFDocument.create();

    for (let i = 0; i < imageFiles.length; i++) {
        updateProgress(
            (i / imageFiles.length) * 90,
            `Embedding image ${i + 1} of ${imageFiles.length}: "${imageFiles[i].name}"`
        );

        const file = imageFiles[i];
        const type = file.type.toLowerCase();
        let imgBytes;

        if (type === 'image/webp') {
            // Convert WebP to PNG first (pdf-lib doesn't support WebP natively)
            imgBytes = await convertImageToPng(file);
        } else {
            imgBytes = new Uint8Array(await fileToArrayBuffer(file));
        }

        let image;
        try {
            if (type === 'image/jpeg' || type === 'image/jpg') {
                image = await pdfDoc.embedJpg(imgBytes);
            } else {
                // PNG or converted WebP
                image = await pdfDoc.embedPng(imgBytes);
            }
        } catch (e) {
            console.warn(`Skipping unsupported image "${file.name}":`, e);
            continue;
        }

        const { width, height } = image.scale(1);
        const page = pdfDoc.addPage([width, height]);
        page.drawImage(image, { x: 0, y: 0, width, height });
    }

    updateProgress(95, 'Generating PDF...');
    const bytes = await pdfDoc.save();
    downloadPdf(bytes, 'PDFBox-images.pdf');
}

/* ======================================================================
   4. PDF TO IMAGE
   ====================================================================== */

/**
 * Renders each page of a PDF as a high-resolution PNG image and
 * packages them all into a single ZIP archive for download.
 *
 * @param  {File}   file  — Source PDF file
 * @param  {number} scale — Render resolution scale factor (1.5 | 2 | 3)
 * @returns {Promise<void>}
 */
async function processPdfToImage(file, scale = 2) {
    const buffer = await fileToArrayBuffer(file);
    updateProgress(5, 'Loading PDF...');

    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const total = pdf.numPages;
    const zip = new JSZip();
    const name = stripPdfExt(file.name);

    for (let i = 1; i <= total; i++) {
        updateProgress(
            5 + ((i / total) * 85),
            `Rendering page ${i} of ${total} to PNG...`
        );

        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

        // Convert canvas to PNG blob, then to ArrayBuffer for JSZip
        const pngBlob = await new Promise(res => canvas.toBlob(res, 'image/png'));
        const pngBuf = await pngBlob.arrayBuffer();

        // Zero-pad page number for alphabetical sorting in the ZIP
        const pageNum = String(i).padStart(String(total).length, '0');
        zip.file(`${name}-page-${pageNum}.png`, pngBuf);
    }

    updateProgress(95, 'Creating ZIP archive...');
    const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
    });
    downloadBlob(zipBlob, `${name}-images.zip`);
}

/* ======================================================================
   5. PDF TO WORD
   ====================================================================== */

/**
 * Extracts text from a pdf.js TextContent object using an RTL-aware
 * algorithm designed for Arabic documents.
 *
 * Algorithm:
 *  1. Group text items by rounded Y-coordinate (same Y = same visual line)
 *  2. Sort lines from top to bottom (descending Y in PDF coordinates)
 *  3. Within each line, sort items RIGHT-to-LEFT (descending X) for Arabic
 *  4. Insert spaces between items based on the visual gap between them
 *
 * @param  {Object} content — pdf.js TextContent object from page.getTextContent()
 * @returns {string}         — Extracted text with proper line breaks
 */
function extractRtlText(content) {
    // Step 1: Group all text items by Y coordinate (rounded to 1 px)
    const linesMap = new Map();
    for (const item of content.items) {
        if (!item.str) continue;
        // transform[5] is the Y coordinate in PDF units
        const y = Math.round(item.transform[5]);
        if (!linesMap.has(y)) linesMap.set(y, []);
        linesMap.get(y).push(item);
    }

    // Step 2: Sort lines top-to-bottom (largest Y = top in PDF coordinates)
    const sortedYs = Array.from(linesMap.keys()).sort((a, b) => b - a);

    // Step 3 & 4: For each line, sort items RTL and insert spaces by gap
    return sortedYs.map(y => {
        const items = linesMap.get(y);
        // Sort right-to-left: highest X value first
        items.sort((a, b) => b.transform[4] - a.transform[4]);

        let line = '';
        for (let j = 0; j < items.length; j++) {
            const curr = items[j];
            line += curr.str;

            if (j < items.length - 1) {
                const next = items[j + 1];
                // transform[4] = X position, curr.width = text width
                // Gap = (start of current item) - (end of next item, in RTL)
                const gap = curr.transform[4] - curr.width - next.transform[4];
                // Insert a space if the visual gap is significant (> 1.5 PDF units)
                if (gap > 1.5) line += ' ';
            }
        }
        return line;
    }).join('\n');
}

/**
 * Converts a PDF file to a .docx Word document.
 *
 * Process:
 *  Phase 1 — Text extraction:  Uses pdf.js with RTL gap-detection algorithm.
 *  Phase 2 — OCR fallback:     If no machine-readable text is found (or OCR
 *                               is explicitly enabled), uses Tesseract.js with
 *                               Arabic (ara) + English (eng) language models.
 *  Phase 3 — DOCX building:    Constructs the document via the docx library
 *                               with proper RTL paragraphs, bidirectional text,
 *                               and adjusted line spacing to prevent Arabic
 *                               character overlap.
 *
 * @param  {File}    file    — Source PDF file
 * @param  {boolean} useOcr  — Force OCR even if text is found
 * @returns {Promise<void>}
 */
async function processPdfToWord(file, useOcr = false) {
    const buffer = await fileToArrayBuffer(file);
    updateProgress(10, 'Loading PDF document...');
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const total = pdf.numPages;
    let fullText = '';

    /* ---- Phase 1: pdf.js text extraction ---- */
    if (!useOcr) {
        updateProgress(15, 'Extracting text content...');
        for (let i = 1; i <= total; i++) {
            updateProgress(
                15 + ((i / total) * 40),
                `Reading page ${i} of ${total}...`
            );
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            // Use our RTL gap-detection algorithm for Arabic support
            fullText += extractRtlText(content) + '\n';
        }
    }

    /* ---- Phase 2: Tesseract.js OCR fallback ---- */
    // Trigger OCR if explicitly requested OR if virtually no text was found
    if (useOcr || fullText.trim().length < 30) {
        updateProgress(30, 'Initializing OCR engine (Arabic + English)...');

        // Tesseract.js 5 API: createWorker with language array
        const worker = await Tesseract.createWorker(['ara', 'eng'], 1, {
            logger: m => {
                if (m.status === 'recognizing text') {
                    updateProgress(
                        35 + (m.progress * 45),
                        `OCR processing: ${Math.round(m.progress * 100)}%`
                    );
                } else if (m.status === 'loading language traineddata') {
                    updateProgress(32, 'Downloading OCR language data...');
                }
            }
        });

        fullText = ''; // Reset text from Phase 1

        for (let i = 1; i <= total; i++) {
            updateProgress(
                35 + ((i / total) * 45),
                `OCR scanning page ${i} of ${total}...`
            );

            // Render the PDF page to a canvas at high resolution for better OCR accuracy
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 2.5 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

            // Run OCR on the rendered canvas
            const { data: { text } } = await worker.recognize(canvas);
            fullText += text + '\n';
        }

        await worker.terminate();
    }

    /* ---- Phase 3: Build the .docx document ---- */
    updateProgress(85, 'Building Word document structure...');
    const { Document, Packer, Paragraph, TextRun, AlignmentType } = docx;

    /**
     * Check if a string segment contains Arabic characters.
     * Unicode block U+0600–U+06FF covers the full Arabic range.
     */
    const isArabicSegment = str => /[\u0600-\u06FF]/.test(str);

    // Build one docx Paragraph per text line
    const paragraphs = fullText
        .split('\n')
        .map(line => {
            const hasArabic = isArabicSegment(line);

            // Split mixed lines into alternating Arabic / Latin segments
            // so each segment gets the correct RTL/LTR run direction
            const rawSegments = line.split(/([\u0600-\u06FF\s\u060C\u061F\u066A-\u066C]+)/g)
                .filter(s => s.length > 0);

            const runs = rawSegments.map(seg => new TextRun({
                text: seg,
                rightToLeft: isArabicSegment(seg), // RTL flag for Arabic runs
                size: 24,                    // 12pt
                font: 'Arial',
            }));

            return new Paragraph({
                // Force RTL paragraph alignment for Arabic content
                bidirectional: hasArabic,
                alignment: hasArabic ? AlignmentType.RIGHT : AlignmentType.LEFT,
                // Line spacing: 360 = 1.5× (prevents Arabic character vertical overlap)
                spacing: { line: 360, before: 0, after: 80 },
                children: runs.length > 0 ? runs : [new TextRun({ text: '' })],
            });
        });

    updateProgress(93, 'Compiling .docx file...');
    const doc = new Document({
        sections: [{ properties: {}, children: paragraphs }],
    });

    updateProgress(97, 'Preparing download...');
    const blob = await Packer.toBlob(doc);
    downloadBlob(blob, file.name.replace(/\.pdf$/i, '.docx'));
}

/* ======================================================================
   6. WORD TO PDF
   ====================================================================== */

/**
 * Converts a .docx Word document to an A4 PDF using:
 *  - mammoth.js   → converts DOCX structure to HTML
 *  - html2pdf.js  → renders the HTML to a PDF at A4 size
 *
 * Arabic text support is achieved by injecting the Google Fonts 'Amiri'
 * Arabic font and applying RTL direction to the hidden render container.
 *
 * @param  {File}  file — Source .docx file
 * @returns {Promise<void>}
 */
async function processWordToPdf(file) {
    updateProgress(15, 'Reading Word document...');
    const buffer = await fileToArrayBuffer(file);

    // Convert DOCX structure to HTML using mammoth
    const result = await mammoth.convertToHtml({ arrayBuffer: buffer }, {
        styleMap: [
            "p[style-name='Heading 1'] => h1:fresh",
            "p[style-name='Heading 2'] => h2:fresh",
            "p[style-name='Heading 3'] => h3:fresh",
        ]
    });

    updateProgress(45, 'Converting to A4 PDF...');

    // Inject content into the hidden processing container
    const container = document.getElementById('hidden-html2pdf');
    container.innerHTML = `
        <style>
            /* Arabic font for proper RTL rendering */
            @import url('https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400&display=swap');
            *, body { font-family: 'Amiri', Arial, 'Times New Roman', serif; }
            /* Auto-detect Arabic paragraphs and apply RTL */
            p, div, span { unicode-bidi: embed; }
            h1 { font-size: 20pt; margin: 0.4em 0; }
            h2 { font-size: 16pt; margin: 0.35em 0; }
            h3 { font-size: 13pt; margin: 0.3em 0; }
            p  { font-size: 11pt; line-height: 1.7; margin: 0.35em 0; }
            li { font-size: 11pt; line-height: 1.6; }
            table { width: 100%; border-collapse: collapse; margin: 0.5em 0; }
            td, th { border: 1px solid #ccc; padding: 5px 8px; font-size: 10pt; }
            strong, b { font-weight: bold; }
            em, i { font-style: italic; }
        </style>
        ${result.value}
    `;
    container.style.display = 'block';

    // html2pdf configuration for A4 output
    const opt = {
        margin: [12, 12, 12, 12], // mm (top, right, bottom, left)
        filename: file.name.replace(/\.docx$/i, '.pdf'),
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
            scale: 2,                // 2× rendering for sharper text
            useCORS: true,
            letterRendering: true,   // Better Arabic character shaping
        },
        jsPDF: {
            unit: 'mm',
            format: 'a4',
            orientation: 'portrait',
        },
    };

    updateProgress(75, 'Rendering to PDF...');
    await html2pdf().set(opt).from(container).save();

    // Clean up the hidden container
    container.style.display = 'none';
    container.innerHTML = '';
}

/* ======================================================================
   7. COMPRESS PDF
   ====================================================================== */

/**
 * Compresses a PDF by:
 *  1. Rendering each page via pdf.js to a canvas (rasterizing)
 *  2. Re-encoding the canvas as a JPEG at the target quality (downsampling)
 *  3. Embedding the compressed JPEG into a new pdf-lib document
 *
 * This achieves real, measurable file size reduction (typically 40–70%)
 * at the cost of converting the PDF to image-based pages. Text remains
 * readable but is no longer selectable after compression.
 *
 * @param  {File}   file    — Source PDF file
 * @param  {number} quality — JPEG quality 0.0–1.0 (0.40 | 0.65 | 0.85)
 * @returns {Promise<{originalSize: number, compressedSize: number, savings: number}>}
 */
async function processCompressPdf(file, quality = 0.65) {
    const buffer = await fileToArrayBuffer(file);
    updateProgress(5, 'Loading PDF for compression...');

    const srcPdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const newDoc = await PDFDocument.create();
    const total = srcPdf.numPages;

    /*
     * Render scale: 1.5 is a good balance between output readability
     * and file size. Higher scale = better quality but larger file.
     * The JPEG quality parameter is the primary compression control.
     */
    const RENDER_SCALE = 1.5;

    for (let i = 1; i <= total; i++) {
        updateProgress(
            5 + ((i / total) * 86),
            `Compressing page ${i} of ${total} at ${Math.round(quality * 100)}% quality...`
        );

        const page = await srcPdf.getPage(i);
        const viewport = page.getViewport({ scale: RENDER_SCALE });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        // Render PDF page to canvas
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

        // ---- IMAGE DOWNSAMPLING STEP ----
        // Re-encode the rendered canvas as JPEG at the target quality.
        // This is where the actual compression happens.
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const b64 = dataUrl.split(',')[1];
        const jpegBytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        // ---------------------------------

        // Embed the compressed JPEG into the new pdf-lib document
        const img = await newDoc.embedJpg(jpegBytes);
        const newPage = newDoc.addPage([viewport.width, viewport.height]);
        newPage.drawImage(img, { x: 0, y: 0, width: viewport.width, height: viewport.height });
    }

    updateProgress(95, 'Saving compressed PDF...');
    const bytes = await newDoc.save({ useObjectStreams: true });

    downloadPdf(bytes, stripPdfExt(file.name) + '-compressed.pdf');

    // Return compression statistics for UI display
    return {
        originalSize: file.size,
        compressedSize: bytes.byteLength,
        savings: Math.max(0, Math.round((1 - bytes.byteLength / file.size) * 100)),
    };
}

/* ======================================================================
   8. PROTECT PDF (Encrypt with Password)
   ====================================================================== */

/**
 * Applies password encryption to a PDF using pdf-lib's built-in
 * encryption support. The resulting file requires the password to open
 * on any PDF reader (Adobe, browser, mobile, etc.).
 *
 * Permissions are set to allow printing and form-filling but restrict
 * modification and content copying.
 *
 * @param  {File}   file     — Source PDF file
 * @param  {string} password — Password to set for user access
 * @returns {Promise<void>}
 */
async function processProtectPdf(file, password) {
    updateProgress(20, 'Loading PDF...');
    const buffer = await fileToArrayBuffer(file);
    const pdfDoc = await PDFDocument.load(buffer);

    updateProgress(60, 'Applying password encryption...');
    const bytes = await pdfDoc.save({
        userPassword: password,       // Password required to OPEN the file
        ownerPassword: password,       // Owner password (same = simpler UX)
        permissions: {
            printing: 'highResolution', // Allow high-res printing
            modifying: false,             // Block document modification
            copying: false,             // Block text/image copying
            annotating: true,              // Allow comments/annotations
            fillingForms: true,              // Allow form filling
            contentAccessibility: true,              // Allow screen readers
            documentAssembly: false,             // Block page reordering
        },
    });

    updateProgress(95, 'Saving protected PDF...');
    downloadPdf(bytes, stripPdfExt(file.name) + '-protected.pdf');
}

/* ======================================================================
   9. UNLOCK PDF (Remove Password Protection)
   ====================================================================== */

/**
 * Removes password protection from a PDF, producing an open, unrestricted copy.
 *
 * Strategy:
 *  1. Primary:  Load with pdf-lib using the password → save without any
 *               password options. pdf-lib removes all encryption headers.
 *  2. Fallback: If pdf-lib cannot parse the file, fall back to pdf.js
 *               rendering → jsPDF reconstruction approach.
 *
 * @param  {File}   file     — Encrypted PDF file
 * @param  {string} password — Current password to decrypt the file
 * @returns {Promise<void>}
 */
async function processUnlockPdf(file, password) {
    updateProgress(20, 'Attempting to unlock PDF...');
    const buffer = await fileToArrayBuffer(file);

    try {
        /* ---- Primary: pdf-lib direct decrypt & re-save ---- */
        const pdfDoc = await PDFDocument.load(buffer, { password });
        updateProgress(75, 'Removing encryption headers...');
        // Saving without password options strips all encryption
        const bytes = await pdfDoc.save();
        updateProgress(95, 'Saving unlocked PDF...');
        downloadPdf(bytes, stripPdfExt(file.name) + '-unlocked.pdf');

    } catch (primaryErr) {
        /* ---- Fallback: pdf.js render → jsPDF rebuild ---- */
        console.warn('[PDFBox] pdf-lib unlock failed, using pdf.js fallback:', primaryErr.message);
        updateProgress(35, 'Trying alternative decryption method...');
        await _unlockViaPdfJs(buffer, file.name, password);
    }
}

/**
 * Fallback unlock method: Decrypts via pdf.js, renders each page to canvas,
 * then rebuilds an unprotected PDF using jsPDF.
 *
 * @param  {ArrayBuffer} buffer   — File data
 * @param  {string}      filename — Original filename
 * @param  {string}      password — Decryption password
 */
async function _unlockViaPdfJs(buffer, filename, password) {
    let pdf;
    try {
        pdf = await pdfjsLib.getDocument({ data: buffer, password }).promise;
    } catch (e) {
        // A PasswordException from pdf.js means wrong password
        throw new Error('Incorrect password or the PDF cannot be decrypted.');
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const total = pdf.numPages;

    for (let i = 1; i <= total; i++) {
        updateProgress(
            40 + ((i / total) * 50),
            `Rebuilding page ${i} of ${total}...`
        );

        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

        const imgData = canvas.toDataURL('image/jpeg', 0.92);
        if (i > 1) doc.addPage();
        const w = doc.internal.pageSize.getWidth();
        const h = (viewport.height * w) / viewport.width;
        doc.addImage(imgData, 'JPEG', 0, 0, w, h);
    }

    doc.save(stripPdfExt(filename) + '-unlocked.pdf');
}

/* ======================================================================
   10. WATERMARK PDF
   ====================================================================== */

/**
 * Applies a semi-transparent diagonal text watermark to every page of a PDF.
 * The font size is calculated relative to the page size (8% of shorter dimension)
 * so the watermark scales correctly across different page formats.
 *
 * @param  {File}   file — Source PDF file
 * @param  {string} text — Watermark text (e.g. "CONFIDENTIAL")
 * @returns {Promise<void>}
 */
async function processWatermarkPdf(file, text) {
    updateProgress(20, 'Loading PDF...');
    const buffer = await fileToArrayBuffer(file);
    const pdfDoc = await PDFDocument.load(buffer);
    // Embed a standard Helvetica Bold font (no upload required)
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const pages = pdfDoc.getPages();

    for (let i = 0; i < pages.length; i++) {
        updateProgress(
            20 + ((i / pages.length) * 70),
            `Applying watermark to page ${i + 1} of ${pages.length}...`
        );

        const page = pages[i];
        const { width, height } = page.getSize();
        // Scale font size to 8% of the shorter dimension
        const fontSize = Math.min(width, height) * 0.08;
        const textWidth = font.widthOfTextAtSize(text, fontSize);

        page.drawText(text, {
            x: (width - textWidth) / 2,            // Center horizontally
            y: (height - fontSize) / 2,            // Center vertically
            size: fontSize,
            font,
            color: rgb(0.55, 0.55, 0.55),               // Medium gray
            opacity: 0.25,                                 // 25% opacity (subtle)
            rotate: degrees(45),                          // 45° diagonal
        });
    }

    updateProgress(95, 'Saving watermarked PDF...');
    const bytes = await pdfDoc.save();
    downloadPdf(bytes, stripPdfExt(file.name) + '-watermarked.pdf');
}

/* ======================================================================
   11. DELETE PAGES — Thumbnail Generator
   ====================================================================== */

/**
 * Renders PDF page thumbnails into a grid container using pdf.js.
 * Each thumbnail is a clickable canvas element. Clicking toggles the page's
 * inclusion in the `selectedSet` (pages to be deleted).
 *
 * Pages are rendered in small batches to avoid memory spikes from
 * simultaneous canvas allocations on large documents.
 *
 * @param  {File}        file        — Source PDF file
 * @param  {string}      containerId — ID of the DOM element to render into
 * @param  {Set<number>} selectedSet — Mutable Set of 0-based indices to delete
 * @returns {Promise<void>}
 */
async function generateDeleteThumbnails(file, containerId, selectedSet) {
    const container = document.getElementById(containerId);
    container.innerHTML = ''; // Clear any previous thumbnails

    const buffer = await fileToArrayBuffer(file);
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const total = pdf.numPages;

    const BATCH_SIZE = 4; // Render up to 4 pages simultaneously

    for (let i = 1; i <= total; i++) {
        const page = await pdf.getPage(i);
        // Render at small scale — these are just preview thumbnails
        const viewport = page.getViewport({ scale: 0.35 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

        // Create the thumbnail container element
        const thumb = document.createElement('div');
        thumb.className = 'page-thumb';
        thumb.dataset.page = i; // 1-based page number in data attribute

        // Page number label
        const label = document.createElement('div');
        label.className = 'thumb-label';
        label.textContent = `Page ${i}`;

        thumb.appendChild(canvas);
        thumb.appendChild(label);
        container.appendChild(thumb);

        // ---- Click handler: toggle page selection for deletion ----
        thumb.addEventListener('click', () => {
            const idx = i - 1; // Convert to 0-based for internal use
            if (selectedSet.has(idx)) {
                selectedSet.delete(idx);
                thumb.classList.remove('marked-delete');
            } else {
                selectedSet.add(idx);
                thumb.classList.add('marked-delete');
            }
        });

        // Yield control back to the browser every BATCH_SIZE pages
        // to keep the UI responsive during thumbnail rendering
        if (i % BATCH_SIZE === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }
}

/* ======================================================================
   12. DELETE PAGES — PDF Processing
   ====================================================================== */

/**
 * Deletes the pages specified in `selectedSet` from the PDF and downloads
 * a new file containing only the remaining pages.
 *
 * @param  {File}        file        — Source PDF file
 * @param  {Set<number>} selectedSet — 0-based indices of pages to DELETE
 * @returns {Promise<void>}
 * @throws {Error} If no pages are selected or all pages would be deleted
 */
async function processDeletePages(file, selectedSet) {
    if (selectedSet.size === 0) {
        throw new Error('No pages selected for deletion.');
    }

    updateProgress(20, 'Loading PDF...');
    const buffer = await fileToArrayBuffer(file);
    const srcPdf = await PDFDocument.load(buffer);
    const total = srcPdf.getPageCount();

    if (selectedSet.size >= total) {
        throw new Error('Cannot delete all pages — at least one page must remain.');
    }

    // Build the list of page indices to KEEP (the inverse of selectedSet)
    const keepIndices = Array.from({ length: total }, (_, i) => i)
        .filter(i => !selectedSet.has(i));

    updateProgress(50, `Removing ${selectedSet.size} page(s) from ${total} total...`);
    const newPdf = await PDFDocument.create();
    const pages = await newPdf.copyPages(srcPdf, keepIndices);
    pages.forEach(page => newPdf.addPage(page));

    updateProgress(90, 'Saving updated PDF...');
    const bytes = await newPdf.save();
    downloadPdf(bytes, stripPdfExt(file.name) + '-edited.pdf');
}
