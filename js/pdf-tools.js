/**
 * PDF & Document Conversion Toolkit
 * Complete solutions for:
 * 1. PDF to Word Converter
 * 2. Word to PDF Converter
 * 3. Protect PDF (Password Encryption)
 * 4. Unlock PDF (Decrypt Protected Files)
 * 
 * All processing occurs client-side for maximum security and privacy
 */

const { PDFDocument, PDFName, PDFNumber, degrees, rgb } = PDFLib;

// ============================================================================
// Dynamic CDN script loader (deduplicates concurrent requests)
// ============================================================================

const _scriptLoadPromises = new Map();

function loadScript(src) {
  if (_scriptLoadPromises.has(src)) {
    return _scriptLoadPromises.get(src);
  }

  const promise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });

  _scriptLoadPromises.set(src, promise);
  return promise;
}

const CDN = {
  mammoth: 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js',
  html2canvas: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  html2pdf: 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'
};

async function ensureMammothLoaded() {
  if (window.mammoth || globalThis.mammoth) return window.mammoth || globalThis.mammoth;
  await loadScript(CDN.mammoth);
  if (!window.mammoth) throw new Error('Mammoth.js failed to load from the CDN.');
  return window.mammoth;
}

async function ensureHtml2PdfLoaded() {
  if (window.html2pdf) return window.html2pdf;
  if (!window.html2canvas) await loadScript(CDN.html2canvas);
  await loadScript(CDN.html2pdf);
  if (!window.html2pdf) throw new Error('html2pdf.js failed to load from the CDN.');
  return window.html2pdf;
}

function detectHtmlDirection(html) {
  const plain = (html || '').replace(/<[^>]+>/g, ' ');
  const rtlCount = (plain.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length;
  const ltrCount = (plain.match(/[A-Za-z0-9]/g) || []).length;
  return rtlCount > ltrCount ? 'rtl' : 'ltr';
}

// ============================================================================
// 1. PDF TO WORD CONVERTER — Intelligent Layout-Preserving Engine
// ============================================================================

class PDFToWordConverter {
  constructor() {
    this.pdfDoc = null;
    this.docxLib = globalThis.docx || window.docx || null;
    this.docxReadyPromise = null;
  }

  // ---------------------------------------------------------------------------
  // Library loader
  // ---------------------------------------------------------------------------

  async getDocxLib() {
    if (this.docxLib) return this.docxLib;
    if (this.docxReadyPromise) {
      this.docxLib = await this.docxReadyPromise;
      return this.docxLib;
    }
    this.docxReadyPromise = (async () => {
      if (globalThis.docx) { this.docxLib = globalThis.docx; return this.docxLib; }
      if (window.docx) { this.docxLib = window.docx; return this.docxLib; }
      try {
        const module = await import('https://cdn.jsdelivr.net/npm/docx@7.8.2/+esm');
        this.docxLib = module;
        globalThis.docx = module;
        window.docx = module;
        return this.docxLib;
      } catch (error) {
        throw new Error(`Unable to load the DOCX library: ${error.message}`);
      }
    })();
    this.docxLib = await this.docxReadyPromise;
    return this.docxLib;
  }

  // ---------------------------------------------------------------------------
  // Main conversion entry point
  // ---------------------------------------------------------------------------

  async convert(file, options = {}) {
    try {
      hideConversionNotice();
      const forceOCR = options.forceOCR || false;
      showLoading('📄 Extracting text from PDF...');

      const arrayBuffer = await this.readFile(file);
      this.pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      const pageContent = [];
      const pageCount = this.pdfDoc.numPages;

      for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
        showLoading(`📖 Processing page ${pageNum} of ${pageCount}...`);

        const page = await this.pdfDoc.getPage(pageNum);

        if (forceOCR) {
          // Force OCR mode - skip text extraction, go straight to OCR
          showLoading('🖼️ Running advanced OCR on page...');
          showConversionNotice('Advanced OCR mode: scanning all pages as images for maximum accuracy.', 'warning');
          const ocrText = await this.performOcrOnPage(page);
          pageContent.push(this.buildParagraphsFromText(ocrText, this.detectTextDirection(ocrText)));
          continue;
        }

        const extractedPage = await this.extractTextFromPage(page);
        console.log(`Extracted structured content from page ${pageNum}:`, extractedPage);

        const textLength = (extractedPage?.text || '').replace(/\s+/g, '').length;
        const textIsSuspect = this.isArabicTextSuspect(extractedPage?.text || '');

        if (textLength >= 10 && !textIsSuspect) {
          pageContent.push(extractedPage.paragraphs);
          continue;
        }

        showLoading('🖼️ Reading text from images, please wait...');
        showConversionNotice(
          textIsSuspect
            ? `Page ${pageNum}'s embedded Arabic text appears to be encoded incorrectly. Running OCR in your browser to read it directly from the page image instead.`
            : 'The document appears to contain scanned images. OCR is running in your browser to extract text.',
          'warning'
        );

        const ocrText = await this.performOcrOnPage(page);
        console.log(`OCR text from page ${pageNum}:`, ocrText);
        pageContent.push(this.buildParagraphsFromText(ocrText, this.detectTextDirection(ocrText)));
      }

      const fullText = pageContent.flat().map((p) => p.text || '').join('\n\n');
      const extractedCharacterCount = fullText.replace(/\s+/g, '').length;
      console.log('Aggregated extracted text:', fullText);
      console.log('Extraction summary:', { pageCount, extractedCharacterCount, pageContent });

      const minimumExpectedCharacters = Math.max(20, pageCount * 20);
      if (extractedCharacterCount < minimumExpectedCharacters) {
        const msg = 'Warning: This document consists of scanned images and does not contain editable text for conversion.';
        showConversionNotice(msg, 'warning');
        showToast(msg, 'error');
        hideLoading();
        return null;
      }

      showLoading('📝 Creating Word document...');
      const docxLib = await this.getDocxLib();
      if (!docxLib || !docxLib.Document || !docxLib.Packer) {
        throw new Error('The docx library failed to load from the CDN.');
      }

      const doc = new docxLib.Document({
        sections: [{
          properties: {
            page: {
              margin: { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 720, footer: 720, gutter: 0 },
              size: { orientation: docxLib.PageOrientation.PORTRAIT, width: 11900, height: 16840 }
            }
          },
          children: this.createWordContent(pageContent, docxLib)
        }]
      });

      const blob = await docxLib.Packer.toBlob(doc);
      hideConversionNotice();
      hideLoading();
      return blob;

    } catch (error) {
      hideLoading();
      throw new Error(`PDF to Word conversion failed: ${error.message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // OCR fallback
  // ---------------------------------------------------------------------------

  async performOcrOnPage(page) {
    if (!window.Tesseract || !window.Tesseract.createWorker) {
      throw new Error('Tesseract.js failed to load from the CDN.');
    }
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to create an image canvas for OCR.');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: context, viewport }).promise;
    const worker = await window.Tesseract.createWorker('ara+eng', 1, {
      logger: (msg) => {
        if (msg?.status === 'recognizing text' && typeof msg.progress === 'number') {
          showLoading(`🖼️ Reading text from images... ${Math.round(msg.progress * 100)}%`);
        }
      }
    });
    const { data } = await worker.recognize(canvas);
    await worker.terminate();
    return (data?.text || '').replace(/\s+/g, ' ').trim();
  }

  // ===========================================================================
  // INTELLIGENT TEXT EXTRACTION ENGINE
  // ===========================================================================

  // --- Unicode ranges ---
  static RTL_RANGE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;
  static ARABIC_CORE = /[\u0621-\u063A\u0640-\u064A\u064B-\u0652]/;
  static ARABIC_SUSPECT_MIN = 8;
  static ARABIC_SUSPECT_RATIO = 0.12;

  // -----------------------------------------------------------------------
  // detectTextDirection — returns 'rtl' or 'ltr'
  // -----------------------------------------------------------------------

  detectTextDirection(text) {
    const rtlCount = (text.match(PDFToWordConverter.RTL_RANGE) || []).length;
    const ltrCount = (text.match(/[A-Za-z0-9]/g) || []).length;
    return rtlCount > ltrCount ? 'rtl' : 'ltr';
  }

  isRtlText(text) { return this.detectTextDirection(text) === 'rtl'; }

  // -----------------------------------------------------------------------
  // isArabicTextSuspect — broken ToUnicode mapping detector
  // -----------------------------------------------------------------------

  isArabicTextSuspect(text) {
    const chars = (text || '').match(PDFToWordConverter.RTL_RANGE) || [];
    if (chars.length < PDFToWordConverter.ARABIC_SUSPECT_MIN) return false;
    const core = chars.filter((c) => PDFToWordConverter.ARABIC_CORE.test(c)).length;
    return (1 - core / chars.length) > PDFToWordConverter.ARABIC_SUSPECT_RATIO;
  }

  // -----------------------------------------------------------------------
  // Extract raw items from a pdf.js page with enriched metadata
  // -----------------------------------------------------------------------

  extractRawItems(textContent) {
    return (textContent.items || [])
      .filter((item) => item && typeof item.str === 'string' && item.str.trim())
      .map((item) => {
        const t = item.transform || [1, 0, 0, 1, 0, 0];
        // Font size from the transform matrix: sqrt(a^2 + b^2) where [a,b] is the
        // horizontal scale vector.  For rotated text use the vertical vector [c,d].
        const hScale = Math.sqrt(t[0] * t[0] + t[1] * t[1]);
        const vScale = Math.sqrt(t[2] * t[2] + t[3] * t[3]);
        const rawFontSize = Math.max(hScale, vScale);

        return {
          text: item.str,
          x: t[4] ?? 0,
          y: t[5] ?? 0,
          width: item.width || 0,
          height: item.height || 0,
          fontName: item.fontName || '',
          rawFontSize,
          hasEOL: !!item.hasEOL
        };
      });
  }

  // -----------------------------------------------------------------------
  // Compute median of a numeric array
  // -----------------------------------------------------------------------

  median(nums) {
    if (!nums.length) return 0;
    const sorted = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  // -----------------------------------------------------------------------
  // detectColumns — cluster items by X position into column groups
  // Returns an array of column objects: { centerX, items[] }
  // -----------------------------------------------------------------------

  detectColumns(items, pageWidth) {
    if (items.length <= 1) return [{ centerX: items[0]?.x ?? 0, items }];

    // Build X-position histogram with bins of 10 units
    const bins = new Map();
    items.forEach((item) => {
      const bin = Math.round(item.x / 10) * 10;
      bins.set(bin, (bins.get(bin) || 0) + 1);
    });

    // Find peaks (column centers) — bins with count > 5% of total items
    const threshold = Math.max(2, items.length * 0.05);
    const peakBins = [...bins.entries()]
      .filter(([, count]) => count >= threshold)
      .sort((a, b) => a[0] - b[0]);

    // Merge nearby peaks (within 40 units) into single columns
    const columnCenters = [];
    for (const [bin] of peakBins) {
      if (columnCenters.length && bin - columnCenters[columnCenters.length - 1] < 40) {
        // Merge: weighted average
        const prev = columnCenters[columnCenters.length - 1];
        columnCenters[columnCenters.length - 1] = (prev + bin) / 2;
      } else {
        columnCenters.push(bin);
      }
    }

    // If only one column detected (or page is narrow), treat as single column
    if (columnCenters.length <= 1 || pageWidth < 500) {
      return [{ centerX: pageWidth / 2, items }];
    }

    // Assign items to nearest column center
    const columns = columnCenters.map((cx) => ({ centerX: cx, items: [] }));
    items.forEach((item) => {
      let minDist = Infinity;
      let bestCol = 0;
      columnCenters.forEach((cx, idx) => {
        const dist = Math.abs(item.x - cx);
        if (dist < minDist) { minDist = dist; bestCol = idx; }
      });
      columns[bestCol].items.push(item);
    });

    return columns.filter((c) => c.items.length > 0);
  }

  // -----------------------------------------------------------------------
  // groupIntoLines — group items on the same vertical band into lines
  // Uses hasEOL flag from pdf.js as primary line-break signal, with
  // adaptive Y-proximity as fallback.
  // -----------------------------------------------------------------------

  groupIntoLines(items) {
    if (!items.length) return [];

    const heights = items.map((i) => Math.abs(i.height)).filter(Boolean);
    const medianH = this.median(heights) || 12;
    const lineTolerance = Math.max(3, medianH * 0.35);

    // Sort top-to-bottom (descending Y), then left-to-right
    const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);

    const lines = [];
    let currentLine = null;

    sorted.forEach((item) => {
      // New line if:
      //  1. No current line yet
      //  2. Previous item on this line had hasEOL (explicit line break in PDF)
      //  3. Y distance exceeds tolerance (items are on different visual lines)
      const prevHadEOL = currentLine && currentLine.lastHasEOL;
      const yDist = currentLine ? Math.abs(item.y - currentLine.y) : Infinity;
      const needsNewLine = !currentLine || prevHadEOL || yDist > lineTolerance;

      if (needsNewLine) {
        currentLine = {
          y: item.y,
          items: [item],
          heights: [Math.abs(item.height || medianH)],
          lastHasEOL: !!item.hasEOL
        };
        lines.push(currentLine);
      } else {
        currentLine.items.push(item);
        if (item.height) currentLine.heights.push(Math.abs(item.height));
        currentLine.lastHasEOL = !!item.hasEOL;
        // Running average Y for more accurate gap measurement
        const n = currentLine.items.length;
        currentLine.y = currentLine.y + (item.y - currentLine.y) / n;
      }
    });

    // Compute average height per line
    lines.forEach((l) => {
      l.avgHeight = this.median(l.heights) || medianH;
    });

    return lines;
  }

  // -----------------------------------------------------------------------
  // sortLineItems — sort items within a line, handling mixed RTL/LTR
  // Returns segments: [{ direction, items[] }] in reading order
  // -----------------------------------------------------------------------

  sortLineItems(items) {
    if (!items.length) return [];

    // First: sort by X ascending to get spatial order
    const byX = [...items].sort((a, b) => a.x - b.x);

    // Detect directional segments by scanning for script changes
    const segments = [];
    let currentSeg = { direction: null, items: [] };

    byX.forEach((item) => {
      const itemDir = this.detectTextDirection(item.text);
      if (!currentSeg.direction) {
        currentSeg.direction = itemDir;
        currentSeg.items.push(item);
      } else if (itemDir === currentSeg.direction) {
        currentSeg.items.push(item);
      } else {
        // Direction change — start new segment
        if (currentSeg.items.length) segments.push(currentSeg);
        currentSeg = { direction: itemDir, items: [item] };
      }
    });
    if (currentSeg.items.length) segments.push(currentSeg);

    // If only one segment, that's the line direction
    if (segments.length === 1) {
      const dir = segments[0].direction;
      segments[0].items.sort((a, b) => dir === 'rtl' ? b.x - a.x : a.x - b.x);
      return segments;
    }

    // Multiple segments: sort items within each segment by their direction
    segments.forEach((seg) => {
      seg.items.sort((a, b) => seg.direction === 'rtl' ? b.x - a.x : a.x - b.x);
    });

    return segments;
  }

  // -----------------------------------------------------------------------
  // computeGap — adaptive gap between two consecutive items
  // -----------------------------------------------------------------------

  computeGap(prev, curr, isRtl) {
    if (isRtl) {
      return (prev.x - (prev.width || 0)) - curr.x;
    }
    return curr.x - (prev.x + (prev.width || 0));
  }

  // -----------------------------------------------------------------------
  // formatLine — assemble a single line's text with proper spacing
  // -----------------------------------------------------------------------

  formatLine(items) {
    if (!items || !items.length) return '';

    const segments = this.sortLineItems(items);
    if (!segments.length) return '';

    // Compute adaptive gap threshold from this line's character widths
    const widths = items.map((i) => i.width / Math.max(1, i.text.length)).filter(Boolean);
    const medianCharWidth = this.median(widths) || 4;
    const gapThreshold = Math.max(1.5, medianCharWidth * 0.3);

    const lineParts = [];

    segments.forEach((seg) => {
      const dir = seg.direction;
      let partText = seg.items[0].text;
      for (let i = 1; i < seg.items.length; i++) {
        const gap = this.computeGap(seg.items[i - 1], seg.items[i], dir === 'rtl');
        if (gap > gapThreshold) {
          partText += ' ' + seg.items[i].text;
        } else {
          partText += seg.items[i].text;
        }
      }
      lineParts.push({ text: partText, direction: dir });
    });

    // For a single-direction line, return directly
    if (lineParts.length === 1) {
      return this.normalizeText(lineParts[0].text, lineParts[0].direction);
    }

    // For mixed-direction lines: LTR parts read left-to-right, RTL parts right-to-left
    // Place LTR parts first (they appear on the left visually), then RTL parts
    const ltrParts = lineParts.filter((p) => p.direction === 'ltr');
    const rtlParts = lineParts.filter((p) => p.direction === 'rtl');
    const ordered = [...ltrParts, ...rtlParts];
    return this.normalizeText(ordered.map((p) => p.text).join(' '), 'auto');
  }

  // -----------------------------------------------------------------------
  // normalizeText — collapse whitespace, fix Arabic punctuation spacing
  // -----------------------------------------------------------------------

  normalizeText(text, _direction) {
    return text
      .replace(/[ \t]+/g, ' ')
      .replace(/ ([،؛؟!،])/g, '$1')
      .replace(/([،؛؟!،]) /g, '$1')
      .trim();
  }

  // -----------------------------------------------------------------------
  // estimateFontSize — accurate size from transform matrix data
  // -----------------------------------------------------------------------

  estimateFontSize(items) {
    if (!items.length) return 24;
    const sizes = items.map((i) => i.rawFontSize).filter((s) => s > 0);
    if (!sizes.length) return 24;
    const med = this.median(sizes);
    // Convert PDF points to half-points for docx (1 pt = 2 half-points)
    // Typical body text is 10-12pt → 20-24 half-points
    const halfPoints = Math.round(med * 2);
    return Math.max(16, Math.min(72, halfPoints));
  }

  // -----------------------------------------------------------------------
  // detectParagraphAlignment — determine alignment from line edges
  // -----------------------------------------------------------------------

  detectParagraphAlignment(lines, pageWidth) {
    if (lines.length < 2) {
      const dir = this.detectTextDirection(lines.map((l) => l.items.map((i) => i.text).join('')).join(''));
      return dir === 'rtl' ? 'right' : 'left';
    }

    const leftEdges = lines.map((l) => Math.min(...l.items.map((i) => i.x)));
    const rightEdges = lines.map((l) => Math.max(...l.items.map((i) => i.x + (i.width || 0))));

    const leftVariance = this.median(leftEdges.map((e) => Math.abs(e - leftEdges[0])));
    const rightVariance = this.median(rightEdges.map((e) => Math.abs(e - rightEdges[0])));
    const centerX = pageWidth / 2;
    const avgCenter = this.median(lines.map((l) => {
      const min = Math.min(...l.items.map((i) => i.x));
      const max = Math.max(...l.items.map((i) => i.x + (i.width || 0)));
      return (min + max) / 2;
    }));

    // Check if all lines are roughly centered
    if (Math.abs(avgCenter - centerX) < pageWidth * 0.1 && leftVariance < 20 && rightVariance < 20) {
      return 'center';
    }

    // Check if lines have consistent left edge (left-aligned)
    if (leftVariance < 15) return 'left';

    // Check if lines have consistent right edge (right-aligned)
    if (rightVariance < 15) return 'right';

    // Otherwise: justified
    return 'justify';
  }

  // -----------------------------------------------------------------------
  // groupLinesIntoParagraphs — detect paragraph breaks by:
  //   1. Large vertical gaps between lines
  //   2. Script changes (English → Arabic or vice versa)
  // This prevents bilingual documents from merging English+Arabic into one paragraph.
  // -----------------------------------------------------------------------

  groupLinesIntoParagraphs(lines, pageWidth) {
    if (!lines.length) return [];

    const heights = lines.map((l) => l.avgHeight).filter(Boolean);
    const medianH = this.median(heights) || 12;
    // Tighter gap threshold: 1.0× median height (was 1.35×)
    const paraGapThreshold = medianH * 1.0;

    const paragraphs = [];
    let currentPara = { lines: [lines[0]] };

    // Helper: get dominant script direction of a line's items
    const lineDirection = (line) => {
      const text = line.items.map((i) => i.text).join('');
      return this.detectTextDirection(text);
    };

    let prevDir = lineDirection(lines[0]);

    for (let i = 1; i < lines.length; i++) {
      const prevLine = lines[i - 1];
      const currLine = lines[i];
      const gap = Math.abs(prevLine.y - currLine.y);
      const currDir = lineDirection(currLine);

      // Paragraph break when:
      //  1. Large vertical gap (bigger than threshold), OR
      //  2. Script changes between consecutive lines (English→Arabic or Arabic→English)
      const isGapBreak = gap > paraGapThreshold;
      const isScriptBreak = currDir !== prevDir && currentPara.lines.length > 0;

      if (isGapBreak || isScriptBreak) {
        console.log(`  Para break at line ${i}: ${isGapBreak ? 'gap' : 'script-change'} (${prevDir}→${currDir}) gap=${gap.toFixed(1)} threshold=${paraGapThreshold.toFixed(1)}`);
        const built = this.buildParagraphFromLines(currentPara.lines, pageWidth);
        if (built) paragraphs.push(built);
        currentPara = { lines: [currLine] };
      } else {
        currentPara.lines.push(currLine);
      }

      prevDir = currDir;
    }

    // Finalize last paragraph
    const built = this.buildParagraphFromLines(currentPara.lines, pageWidth);
    if (built) paragraphs.push(built);

    return paragraphs;
  }

  // -----------------------------------------------------------------------
  // buildParagraphFromLines — create paragraph object from grouped lines
  // -----------------------------------------------------------------------

  buildParagraphFromLines(lines, pageWidth) {
    if (!lines.length) return null;

    const textLines = lines.map((line) => this.formatLine(line.items)).filter(Boolean);
    if (!textLines.length) return null;

    const paragraphText = textLines.join('\n');
    const direction = this.detectTextDirection(paragraphText);
    const isRtl = direction === 'rtl';

    // Font size: use median across ALL items in the paragraph (not just first line)
    const allItems = lines.flatMap((l) => l.items);
    const fontSize = this.estimateFontSize(allItems);

    // Bold: check if ANY item in the paragraph has a bold font name
    const isBold = allItems.some((item) => /bold|heavy|black|semibold/i.test(item.fontName || ''));

    // Italic: check font names for italic/oblique
    const isItalic = allItems.some((item) => /italic|oblique|slant/i.test(item.fontName || ''));

    // Alignment: detect from line edges
    const alignment = this.detectParagraphAlignment(lines, pageWidth);

    return {
      text: paragraphText,
      isRtl,
      alignment,
      fontSize,
      isBold,
      isItalic
    };
  }

  // -----------------------------------------------------------------------
  // extractTextFromPage — main page-level extraction pipeline
  // -----------------------------------------------------------------------

  async extractTextFromPage(page) {
    const textContent = await page.getTextContent({
      disableCombineTextItems: false,
      includeMarkedContent: false
    });

    const items = this.extractRawItems(textContent);
    if (!items.length) return { text: '', paragraphs: [] };

    const viewport = page.getViewport({ scale: 1.0 });
    const pageWidth = viewport.width;

    // Step 1: Detect columns
    const columns = this.detectColumns(items, pageWidth);

    // Step 2: For each column, group into lines, then paragraphs
    const allParagraphs = [];

    // Sort columns in reading order (LTR: left→right, RTL: right→left)
    const pageDir = this.detectTextDirection(items.map((i) => i.text).join(''));
    columns.sort((a, b) => pageDir === 'rtl' ? b.centerX - a.centerX : a.centerX - b.centerX);

    for (const column of columns) {
      const lines = this.groupIntoLines(column.items);
      const paragraphs = this.groupLinesIntoParagraphs(lines, pageWidth);
      allParagraphs.push(...paragraphs);
    }

    console.log(`Page extraction: ${items.length} items, ${columns.length} column(s), ${allParagraphs.length} paragraphs`);
    allParagraphs.forEach((p, i) => {
      console.log(`  Para ${i} [${p.isRtl ? 'RTL' : 'LTR'}] align=${p.alignment} size=${p.fontSize}: "${p.text.substring(0, 80)}..."`);
    });

    const text = allParagraphs.map((p) => p.text).join('\n');
    return { text, paragraphs: allParagraphs };
  }

  // -----------------------------------------------------------------------
  // buildParagraphsFromText — fallback for OCR text
  // -----------------------------------------------------------------------

  buildParagraphsFromText(text, direction = 'ltr') {
    const cleanedText = (text || '').replace(/\s+/g, ' ').trim();
    if (!cleanedText) return [];
    // Split OCR text into paragraphs on double newlines or sentence boundaries
    const rawParagraphs = cleanedText.split(/\n{2,}|\.\s+(?=[A-Z\u0621-\u064A])/);
    return rawParagraphs
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => ({
        text: p,
        isRtl: direction === 'rtl',
        alignment: direction === 'rtl' ? 'right' : 'left',
        fontSize: 24,
        isBold: false,
        isItalic: false
      }));
  }

  // ===========================================================================
  // DOCX OUTPUT GENERATION
  // ===========================================================================

  createWordContent(pageContent, docxLib) {
    const children = [];

    // ── Document title ─────────────────────────────────────────────────────────
    children.push(
      new docxLib.Paragraph({
        children: [new docxLib.TextRun({ text: 'Converted PDF Document', bold: true, size: 32 })],
        heading: docxLib.HeadingLevel.HEADING_1,
        spacing: { line: 276, lineRule: docxLib.LineRuleType?.AUTO, after: 200 },
        alignment: docxLib.AlignmentType.CENTER
      })
    );
    children.push(
      new docxLib.Paragraph({
        children: [new docxLib.TextRun({ text: `Converted on ${new Date().toLocaleString()}`, italics: true, size: 20 })],
        spacing: { line: 276, lineRule: docxLib.LineRuleType?.AUTO, after: 400 },
        alignment: docxLib.AlignmentType.CENTER
      })
    );

    // ── Page content ───────────────────────────────────────────────────────────
    const alignmentMap = {
      left: docxLib.AlignmentType.LEFT,
      right: docxLib.AlignmentType.RIGHT,
      center: docxLib.AlignmentType.CENTER,
      justify: docxLib.AlignmentType.JUSTIFIED
    };

    pageContent.forEach((paragraphs, index) => {
      if (index > 0) {
        children.push(new docxLib.Paragraph({ text: '', pageBreakBefore: true }));
      }

      (paragraphs || []).forEach((paragraph) => {
        const isRtl = Boolean(paragraph.isRtl);
        const lines = (paragraph.text || '').split(/\n+/).filter((l) => l.trim());
        const docxAlignment = alignmentMap[paragraph.alignment] || (isRtl ? docxLib.AlignmentType.RIGHT : docxLib.AlignmentType.LEFT);

        lines.forEach((line) => {
          const runProps = {
            text: line,
            bold: Boolean(paragraph.isBold),
            italics: Boolean(paragraph.isItalic),
            size: Math.max(16, paragraph.fontSize || 24),
            rightToLeft: isRtl
          };

          const paragraphProps = {
            children: [new docxLib.TextRun(runProps)],
            alignment: docxAlignment,
            bidirectional: isRtl,
            rightToLeft: isRtl,
            spacing: {
              line: isRtl ? 360 : 276,
              lineRule: docxLib.LineRuleType?.AUTO ?? 'auto',
              after: isRtl ? 200 : 120
            }
          };

          if (isRtl && docxLib.TextDirection) {
            paragraphProps.textDirection =
              docxLib.TextDirection.RIGHT_TO_LEFT_OVERRIDE ||
              docxLib.TextDirection.RIGHT_TO_LEFT ||
              'rtl';
          }

          children.push(new docxLib.Paragraph(paragraphProps));
        });
      });
    });

    return children;
  }

  // -----------------------------------------------------------------------
  // Utility
  // -----------------------------------------------------------------------

  readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  }
}

// ============================================================================
// 2. WORD TO PDF CONVERTER
// ============================================================================

class WordToPDFConverter {
  constructor() {
    this.wordContent = null;
  }

  async convert(file) {
    let container = null;
    try {
      showLoading('📄 Reading Word document...');

      // 1. Read the uploaded .docx file as an ArrayBuffer
      const arrayBuffer = await this.readFile(file);

      // 2. Use Mammoth.js to convert DOCX -> HTML
      const mammothLib = window.mammoth || globalThis.mammoth;
      if (!mammothLib) throw new Error('Mammoth.js library is not loaded.');
      
      const result = await mammothLib.convertToHtml({ arrayBuffer });
      const htmlContent = result.value;

      if (!htmlContent || htmlContent.trim().length === 0) {
        throw new Error('Mammoth extracted no content. The .docx file may be empty or corrupted.');
      }

      showLoading('🔄 Preparing renderer...');
      
      const html2pdfLib = window.html2pdf;
      if (!html2pdfLib) throw new Error('html2pdf.js library is not loaded.');

      // 3. Create a temporary, off-screen DOM element wrapper
      // Per AGENTS.md: Use opacity: 0.01 + z-index: -9999. Never display: none or left: -9999px.
      container = document.createElement('div');
      container.id = 'word-to-pdf-temp-container';
      
      container.style.cssText = [
        'position: absolute',
        'top: 0',
        'right: 0',
        'width: 794px',
        'z-index: -9999',
        'opacity: 0.01',
        'pointer-events: none',
        'box-sizing: border-box',
        'padding: 20mm',
        'background: white',
        'font-family: system-ui, -apple-system, Arial, sans-serif',
        'line-height: 1.6'
      ].join('; ');

      // 4. Inject parsed HTML
      container.innerHTML = htmlContent;
      document.body.appendChild(container);

      // Wait for DOM to be fully painted
      await document.fonts.ready;
      await new Promise(resolve => setTimeout(resolve, 500));

      showLoading('🖼️ Rendering PDF...');

      // 5 & 6. Configure parameters and render to PDF Blob
      const options = {
        margin: [15, 15, 15, 15],
        filename: 'converted.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      const pdfBlob = await html2pdfLib()
        .set(options)
        .from(container)
        .output('blob');

      // 7. Clean up
      if (container && container.parentNode) {
        document.body.removeChild(container);
      }
      
      hideLoading();
      
      // 8. Return Blob
      return pdfBlob;

    } catch (error) {
      if (container && container.parentNode) {
        document.body.removeChild(container);
      }
      hideLoading();
      throw new Error(`Word to PDF conversion failed: ${error.message}`);
    }
  }

  readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  }
}

// ============================================================================
// 3. PDF ENCRYPTION (Protect PDF with Password)
// ============================================================================

class PDFEncryptor {
  constructor() {
    this.pdfDoc = null;
  }

  async encrypt(file, password) {
    try {
      if (!password || password.length < 4) {
        throw new Error('Password must be at least 4 characters long');
      }

      showLoading('🔐 Loading PDF file...');

      const arrayBuffer = await this.readFile(file);
      const pdfBytes = new Uint8Array(arrayBuffer);
      this.pdfDoc = await PDFDocument.load(pdfBytes);

      showLoading('🔒 Applying password protection & encryption...');

      const protectedPdfBytes = await this.pdfDoc.save({
        userPassword: password,
        ownerPassword: password,
        permissions: {
          printing: 'highResolution',
          modifying: false,
          copying: false,
          annotating: false,
          fillingForms: false,
          contentAccessibility: true,
          documentAssembly: false
        }
      });

      const encryptedBlob = new Blob([protectedPdfBytes], { type: 'application/pdf' });

      showLoading('✅ Finalizing protected PDF...');
      return encryptedBlob;

    } catch (error) {
      throw new Error(`PDF encryption failed: ${error.message}`);
    }
  }

  readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  }
}

// ============================================================================
// 4. PDF DECRYPTION (Unlock PDF and Remove Password)
// ============================================================================

class PDFDecryptor {
  constructor() {
    this.pdfDoc = null;
  }

  async decrypt(file, password) {
    try {
      if (!password) {
        throw new Error('Password is required to decrypt the file');
      }

      showLoading('🔍 Loading encrypted PDF...');

      const arrayBuffer = await this.readFile(file);

      try {
        this.pdfDoc = await PDFDocument.load(arrayBuffer, { password });
      } catch (e) {
        throw new Error('Incorrect password or invalid PDF file');
      }

      showLoading('🔓 Decrypting content...');

      // Create a new PDF document without encryption
      const newPdf = await PDFDocument.create();

      // Copy all pages from the decrypted document
      const pages = await newPdf.copyPages(
        this.pdfDoc,
        this.pdfDoc.getPageIndices()
      );

      pages.forEach(page => {
        newPdf.addPage(page);
      });

      showLoading('💾 Saving decrypted copy...');

      // Save without any encryption
      const decryptedPDF = await newPdf.save();
      return new Blob([decryptedPDF], { type: 'application/pdf' });

    } catch (error) {
      throw new Error(`PDF decryption failed: ${error.message}`);
    }
  }

  readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  }
}

// ============================================================================
// UI HELPER FUNCTIONS
// ============================================================================

function showLoading(message = 'Processing...') {
  const loader = document.getElementById('loading-indicator');
  if (loader) {
    loader.classList.remove('hidden');
    const text = loader.querySelector('strong');
    if (text) text.textContent = message;
  }
}

function hideLoading() {
  const loader = document.getElementById('loading-indicator');
  if (loader) {
    loader.classList.add('hidden');
  }
}

function downloadFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ============================================================================
// MAIN CONVERSION ORCHESTRATOR
// ============================================================================

window.processConversion = async function (currentTool, files) {
  const password = document.getElementById('tool-password')?.value;

  const toolId = typeof currentTool === 'object' ? currentTool.id : currentTool;
  const selectedFiles = files || [];

  if (!selectedFiles || selectedFiles.length === 0) {
    showToast('Please select a file first', 'error');
    return;
  }

  const file = selectedFiles[0];

  if (window.setProcessingState) window.setProcessingState(true);

  try {
    showLoading('Starting conversion...');

    let converter = null;
    let outputFilename = '';
    let blob = null;

    switch (toolId) {
      case 'pdf-to-word':
        if (!file.type.includes('pdf') && !file.name.endsWith('.pdf')) {
          showToast('Please select a PDF file', 'error');
          hideLoading();
          return;
        }
        converter = new PDFToWordConverter();
        const pdfWordMode = document.querySelector('input[name="pdf-word-mode"]:checked')?.value || 'standard';
        blob = await converter.convert(file, { forceOCR: pdfWordMode === 'ocr' });
        outputFilename = file.name.replace(/\.pdf$/i, '.docx') || 'document.docx';
        break;

      case 'word-to-pdf':
        if (!file.type.includes('word') && !file.name.endsWith('.docx') && !file.name.endsWith('.doc')) {
          showToast('Please select a Word document (.docx)', 'error');
          hideLoading();
          return;
        }
        try {
          converter = new WordToPDFConverter();
          blob = await converter.convert(file);
          outputFilename = file.name.replace(/\.docx?$/i, '.pdf') || 'converted.pdf';
        } catch (wordErr) {
          hideLoading();
          showToast('Conversion failed: ' + wordErr.message, 'error');
          return;
        }
        break;

      case 'protect-pdf':
        if (!file.type.includes('pdf') && !file.name.endsWith('.pdf')) {
          showToast('Please select a PDF file', 'error');
          hideLoading();
          return;
        }
        if (!password) {
          showToast('Please enter a password', 'error');
          hideLoading();
          return;
        }
        converter = new PDFEncryptor();
        blob = await converter.encrypt(file, password);
        outputFilename = file.name.replace(/\.pdf$/i, '_protected.pdf') || 'protected.pdf';
        break;
      case 'unlock-pdf':
        if (!file.type.includes('pdf') && !file.name.endsWith('.pdf')) {
          showToast('Please select a PDF file', 'error');
          hideLoading();
          return;
        }
        if (!password) {
          showToast('Please enter the PDF password', 'error');
          hideLoading();
          return;
        }
        converter = new PDFDecryptor();
        blob = await converter.decrypt(file, password);
        outputFilename = file.name.replace(/\.pdf$/i, '_decrypted.pdf') || 'decrypted.pdf';
        break;

      default:
        showToast('Unknown tool', 'error');
        hideLoading();
        return;
    }

    if (blob) {
      hideConversionNotice();
      hideLoading();
      window.showResultScreen(outputFilename, blob);
    }

  } catch (error) {
    hideLoading();
    console.error('Conversion error:', error);
    showToast(error.message, 'error');
  } finally {
    if (window.setProcessingState) window.setProcessingState(false);
  }
};

/** Standalone Word → PDF entry point (uses fixed mammoth + html2pdf pipeline) */
window.convertWordToPdf = async function convertWordToPdf(file) {
  const converter = new WordToPDFConverter();
  return converter.convert(file);
};

/** Standalone PDF → Word entry point (pdf.js text extraction + docx export) */
window.convertPdfToWord = async function convertPdfToWord(file, options = {}) {
  const converter = new PDFToWordConverter();
  return converter.convert(file, options);
};

// Legacy function for compatibility

window.processPDF = async function (toolId, files) {
  window.setProcessingState(true);

  try {
    let resultBytes = null;
    let resultFileName = 'output.pdf';

    switch (toolId) {
      case 'merge':
        resultBytes = await mergePDFs(files);
        resultFileName = 'merged.pdf';
        break;
      case 'split':
        const splitRange = document.getElementById('tool-range')?.value || '';
        const asZip = document.getElementById('split-as-zip')?.checked;
        if (asZip) {
          resultBytes = await extractPagesAsZip(files[0], splitRange);
          resultFileName = 'split-output.zip';
        } else {
          resultBytes = await extractPages(files[0], splitRange);
          resultFileName = 'split-output.pdf';
        }
        break;
      case 'compress':
        const compressLevel = document.querySelector('input[name="compress-level"]:checked')?.value || 'medium';
        resultBytes = await compressPDF(files[0], compressLevel);
        resultFileName = 'compressed.pdf';
        break;
      case 'rotate':
        const rotation = document.getElementById('tool-rotation')?.value || 90;
        resultBytes = await rotatePDF(files[0], parseInt(rotation));
        resultFileName = 'rotated.pdf';
        break;
      case 'delete':
        const deleteRange = document.getElementById('tool-range')?.value || '';
        resultBytes = await deletePages(files[0], deleteRange);
        resultFileName = 'deleted-pages.pdf';
        break;
      case 'watermark':
        const text = document.getElementById('tool-watermark')?.value || 'CONFIDENTIAL';
        resultBytes = await watermarkPDF(files[0], text);
        resultFileName = 'watermarked.pdf';
        break;
      case 'jpg-to-pdf':
        const jpgOrientation = document.getElementById('jpg-orientation')?.value || 'auto';
        const jpgPageSize = document.getElementById('jpg-page-size')?.value || 'a4';
        const jpgSeparate = document.getElementById('jpg-separate')?.checked || false;
        resultBytes = await jpgToPdf(files, { orientation: jpgOrientation, pageSize: jpgPageSize, separate: jpgSeparate });
        resultFileName = jpgSeparate ? 'converted-images.zip' : 'converted.pdf';
        break;
      case 'pdf-to-jpg':
        await pdfToJpg(files[0]);
        window.setProcessingState(false);
        return;
      default:
        throw new Error("Tool not implemented yet.");
    }

    if (resultBytes) {
      const mime = resultFileName.endsWith('.zip') ? 'application/zip' : 'application/pdf';
      const blob = new Blob([resultBytes], { type: mime });
      window.showResultScreen(resultFileName, blob);
    }

  } catch (error) {
    console.error(error);
    showToast('Error processing file: ' + error.message, 'error');
  } finally {
    window.setProcessingState(false);
  }
};

// --- Helper Functions ---
async function fileToBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function downloadBlob(bytes, filename, type) {
  const blob = new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// --- PDF Logic Implementations ---

async function mergePDFs(files) {
  const mergedPdf = await PDFDocument.create();
  for (const file of files) {
    const buffer = await fileToBuffer(file);
    const pdf = await PDFDocument.load(buffer);
    const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }
  return await mergedPdf.save();
}

function parsePageRange(rangeInput, pageCount) {
  if (!rangeInput || !rangeInput.trim()) {
    return Array.from({ length: pageCount }, (_, index) => index);
  }

  const pages = new Set();
  const tokens = rangeInput.split(',').map(token => token.trim()).filter(Boolean);

  for (const token of tokens) {
    const rangeMatch = token.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      let start = parseInt(rangeMatch[1], 10);
      let end = parseInt(rangeMatch[2], 10);
      if (start > end) [start, end] = [end, start];
      for (let page = start; page <= end; page++) {
        if (page < 1 || page > pageCount) {
          throw new Error(`Invalid page range: ${page} is outside document bounds.`);
        }
        pages.add(page - 1);
      }
      continue;
    }

    const singleMatch = token.match(/^(\d+)$/);
    if (singleMatch) {
      const page = parseInt(singleMatch[1], 10);
      if (page < 1 || page > pageCount) {
        throw new Error(`Invalid page number: ${page} is outside document bounds.`);
      }
      pages.add(page - 1);
      continue;
    }

    throw new Error(`Invalid page range format: '${token}'. Use formats like 1-3,5.`);
  }

  return Array.from(pages).sort((a, b) => a - b);
}

async function extractPages(file, range) {
  const buffer = await fileToBuffer(file);
  const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const pageCount = pdf.getPageCount();
  const pageIndices = parsePageRange(range, pageCount);

  const newPdf = await PDFDocument.create();
  const pages = await newPdf.copyPages(pdf, pageIndices);
  pages.forEach((page) => newPdf.addPage(page));
  return await newPdf.save();
}

async function extractPagesAsZip(file, range) {
  const buffer = await fileToBuffer(file);
  const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const pageCount = pdf.getPageCount();
  const pageIndices = parsePageRange(range, pageCount);

  const zip = new JSZip();
  for (const pageIndex of pageIndices) {
    const newPdf = await PDFDocument.create();
    const [copiedPage] = await newPdf.copyPages(pdf, [pageIndex]);
    newPdf.addPage(copiedPage);
    const pdfBytes = await newPdf.save();
    zip.file(`page-${pageIndex + 1}.pdf`, pdfBytes);
  }
  return await zip.generateAsync({ type: 'uint8array' });
}

async function compressPDF(file, level = 'medium') {
  const buffer = await fileToBuffer(file);
  const originalSize = file.size;

  const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const newPdf = await PDFDocument.create();
  const pages = await newPdf.copyPages(pdf, pdf.getPageIndices());
  pages.forEach((page) => newPdf.addPage(page));

  // Compression options based on level
  const options = {
    low: { useObjectStreams: false, updateFieldAppearances: false },
    medium: { useObjectStreams: true, updateFieldAppearances: false },
    strong: { useObjectStreams: true, updateFieldAppearances: false }
  };

  const resultBytes = await newPdf.save(options[level] || options.medium);
  const compressedSize = resultBytes.length;
  const reduction = Math.round((1 - compressedSize / originalSize) * 100);

  // Show compression result in UI
  showCompressionResult(originalSize, compressedSize, reduction);

  return resultBytes;
}

function showCompressionResult(originalSize, compressedSize, reduction) {
  const notice = document.getElementById('conversion-notice');
  if (notice) {
    const formatSize = (bytes) => {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    };

    notice.innerHTML = `
      <i data-lucide="check-circle"></i>
      <span>
        <strong>Compression Complete!</strong><br>
        ${formatSize(originalSize)} → ${formatSize(compressedSize)} (${reduction}% smaller)
      </span>
    `;
    notice.className = 'conversion-notice success';
    notice.classList.remove('hidden');
    lucide.createIcons();
  }
}

async function rotatePDF(file, degreesVal) {
  const buffer = await fileToBuffer(file);
  const pdf = await PDFDocument.load(buffer);
  const pages = pdf.getPages();

  // Check if we have per-page rotations
  if (window.pageRotations && Object.keys(window.pageRotations).length > 0) {
    pages.forEach((page, index) => {
      const pageNum = index + 1;
      const perPageRotation = window.pageRotations[pageNum] || 0;
      if (perPageRotation !== 0) {
        const currentRotation = page.getRotation().angle;
        page.setRotation(degrees(currentRotation + perPageRotation));
      }
    });
  } else {
    // Fallback to global rotation
    pages.forEach(page => {
      const currentRotation = page.getRotation().angle;
      page.setRotation(degrees(currentRotation + degreesVal));
    });
  }

  return await pdf.save();
}

async function deletePages(file, pagesToDelete) {
  const buffer = await fileToBuffer(file);
  const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const count = pdf.getPageCount();
  const pageIndices = parsePageRange(pagesToDelete, count);

  // Remove pages in reverse order to keep indexes stable
  pageIndices.reverse().forEach(index => pdf.removePage(index));
  return await pdf.save();
}

async function watermarkPDF(file, text) {
  const buffer = await fileToBuffer(file);
  const pdf = await PDFDocument.load(buffer);
  const pages = pdf.getPages();
  const { rgb, degrees, StandardFonts } = PDFLib;

  const helveticaFont = await pdf.embedFont(StandardFonts.Helvetica);

  const fontSize = 50;
  const opacity = 0.3;
  const color = rgb(0.85, 0.1, 0.1);
  const spacingX = 250;
  const spacingY = 200;

  pages.forEach(page => {
    const { width, height } = page.getSize();
    for (let x = -width; x < width * 2; x += spacingX) {
      for (let y = -height; y < height * 2; y += spacingY) {
        page.drawText(text, {
          x,
          y,
          size: fontSize,
          font: helveticaFont,
          color,
          rotate: degrees(45),
          opacity,
        });
      }
    }
  });
  return await pdf.save();
}

async function jpgToPdf(files, options = {}) {
  const { orientation = 'auto', pageSize = 'a4', separate = false } = options;

  // A4 size in points
  const pageSizes = {
    a4: { width: 595.28, height: 841.89 },
    letter: { width: 612, height: 792 },
  };

  if (separate) {
    // Create separate PDFs for each image
    const zip = new JSZip();
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const buffer = await fileToBuffer(file);
      let image;
      if (file.type === 'image/jpeg' || file.name.toLowerCase().endsWith('.jpg') || file.name.toLowerCase().endsWith('.jpeg')) {
        image = await pdf.embedJpg(buffer);
      } else if (file.type === 'image/png') {
        image = await pdf.embedPng(buffer);
      } else {
        continue;
      }

      const pdf = await PDFDocument.create();
      let pageWidth, pageHeight;

      if (pageSize === 'fit') {
        pageWidth = image.width;
        pageHeight = image.height;
      } else {
        const size = pageSizes[pageSize] || pageSizes.a4;
        if (orientation === 'landscape') {
          pageWidth = size.height;
          pageHeight = size.width;
        } else if (orientation === 'portrait') {
          pageWidth = size.width;
          pageHeight = size.height;
        } else {
          // auto
          if (image.width > image.height) {
            pageWidth = size.height;
            pageHeight = size.width;
          } else {
            pageWidth = size.width;
            pageHeight = size.height;
          }
        }
      }

      const page = pdf.addPage([pageWidth, pageHeight]);
      // Scale image to fit page
      const scale = Math.min(pageWidth / image.width, pageHeight / image.height);
      const drawW = image.width * scale;
      const drawH = image.height * scale;
      const x = (pageWidth - drawW) / 2;
      const y = (pageHeight - drawH) / 2;

      page.drawImage(image, { x, y, width: drawW, height: drawH });

      const pdfBytes = await pdf.save();
      const baseName = file.name.replace(/\.[^/.]+$/, '');
      zip.file(`${baseName}.pdf`, pdfBytes);
    }

    return await zip.generateAsync({ type: 'uint8array' });
  }

  // Single combined PDF
  const pdf = await PDFDocument.create();

  for (const file of files) {
    const buffer = await fileToBuffer(file);
    let image;
    if (file.type === 'image/jpeg' || file.name.toLowerCase().endsWith('.jpg') || file.name.toLowerCase().endsWith('.jpeg')) {
      image = await pdf.embedJpg(buffer);
    } else if (file.type === 'image/png') {
      image = await pdf.embedPng(buffer);
    } else {
      continue;
    }

    let pageWidth, pageHeight;

    if (pageSize === 'fit') {
      pageWidth = image.width;
      pageHeight = image.height;
    } else {
      const size = pageSizes[pageSize] || pageSizes.a4;
      if (orientation === 'landscape') {
        pageWidth = size.height;
        pageHeight = size.width;
      } else if (orientation === 'portrait') {
        pageWidth = size.width;
        pageHeight = size.height;
      } else {
        // auto
        if (image.width > image.height) {
          pageWidth = size.height;
          pageHeight = size.width;
        } else {
          pageWidth = size.width;
          pageHeight = size.height;
        }
      }
    }

    const page = pdf.addPage([pageWidth, pageHeight]);
    // Scale image to fit page
    const scale = Math.min(pageWidth / image.width, pageHeight / image.height);
    const drawW = image.width * scale;
    const drawH = image.height * scale;
    const x = (pageWidth - drawW) / 2;
    const y = (pageHeight - drawH) / 2;

    page.drawImage(image, { x, y, width: drawW, height: drawH });
  }
  return await pdf.save();
}

async function pdfToJpg(file) {
  showLoading('🖼️ Rendering PDF pages to images...');
  const buffer = await fileToBuffer(file);
  const typedarray = new Uint8Array(buffer);
  const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
  const numPages = pdf.numPages;
  const zip = new JSZip();
  const imgFolder = zip.folder('pages');

  for (let pageNumber = 1; pageNumber <= numPages; pageNumber++) {
    showLoading(`🖼️ Rendering page ${pageNumber} of ${numPages}...`);
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise;

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(b => {
        if (!b) reject(new Error('Unable to create image blob.'));
        else resolve(b);
      }, 'image/jpeg', 0.9);
    });

    const arrayBuf = await blob.arrayBuffer();
    imgFolder.file(`page-${pageNumber}.jpg`, arrayBuf);
  }

  showLoading('📦 Packaging ZIP archive...');
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(zipBlob, 'pdf-pages.zip', 'application/zip');
  hideLoading();
  /**
 * تحويل ملف Word (docx) إلى PDF باستخدام Mammoth و html2pdf
 * @param {ArrayBuffer} arrayBuffer - محتوى ملف الـ Word المرفوع
 * @returns {Promise<Blob>} - ملف الـ PDF الناتج كـ Blob
 */
async function convertWordToPDF(arrayBuffer) {
    try {
        // 1. تحويل ملف الـ Word إلى كود HTML نظيف عبر Mammoth
        const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
        const htmlContent = result.value; 

        if (!htmlContent) {
            throw new Error("لم نتمكن من قراءة محتوى ملف الـ Word، قد يكون الملف فارغاً أو تالفاً.");
        }

        // 2. إنشاء عنصر وهمي (Container) غير مرئي لعرض وتنسيق الـ HTML
        const tempContainer = document.createElement('div');
        tempContainer.style.position = 'absolute';
        tempContainer.style.opacity = '0.01'; // إخفاء العنصر بدلاً من الشاشة
        tempContainer.style.zIndex = '-9999';
        // لا تستخدم left: -9999px أو display: none لأنها تسبب مشكلة ظهور الصفحة بيضاء
        tempContainer.style.width = '800px';  // حجم تقريبي لعرض صفحة A4 بصرياً
        tempContainer.style.padding = '40px'; // هوامش افتراضية للمستند
        tempContainer.style.background = '#ffffff';
        tempContainer.style.fontFamily = 'Arial, sans-serif';
        tempContainer.style.lineHeight = '1.6';
        tempContainer.style.color = '#333333';
        tempContainer.innerHTML = htmlContent;

        document.body.appendChild(tempContainer);

        // 3. إعدادات مكتبة html2pdf لضمان جودة وأبعاد قياسية للملف الناتج
        const options = {
            margin: [15, 15, 15, 15], // الهوامش بالملم (أعلى، أسفل، يسار، يمين)
            filename: 'converted-document.pdf',
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { 
                scale: 2,         // زيادة الدقة والوضوح للنصوص والصور
                useCORS: true, 
                logging: false 
            },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } // أبعاد صفحة A4 القياسية
        };

        // 4. توليد ملف الـ PDF كـ Blob
        const pdfBlob = await html2pdf().set(options).from(tempContainer).outputPdf('blob');

        // 5. تنظيف المتصفح وحذف العنصر الوهمي بعد الانتهاء
        document.body.removeChild(tempContainer);

        return pdfBlob;

    } catch (error) {
        console.error("Error inside convertWordToPDF:", error);
        throw error;
    }
}
}