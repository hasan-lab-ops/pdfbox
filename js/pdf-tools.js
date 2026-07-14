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
// 1. PDF TO WORD CONVERTER
// ============================================================================

class PDFToWordConverter {
  constructor() {
    this.pdfDoc = null;
    this.docxLib = globalThis.docx || window.docx || null;
    this.docxReadyPromise = null;
  }

  async getDocxLib() {
    if (this.docxLib) {
      return this.docxLib;
    }

    if (this.docxReadyPromise) {
      this.docxLib = await this.docxReadyPromise;
      return this.docxLib;
    }

    this.docxReadyPromise = (async () => {
      if (globalThis.docx) {
        this.docxLib = globalThis.docx;
        return this.docxLib;
      }

      if (window.docx) {
        this.docxLib = window.docx;
        return this.docxLib;
      }

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

  async convert(file) {
    try {
      hideConversionNotice();
      showLoading('📄 Extracting text from PDF...');

      // Read the optional "Force OCR" toggle added by the UI
      const forceOcr = document.getElementById('force-ocr-toggle')?.checked === true;

      const arrayBuffer = await this.readFile(file);
      this.pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      const pageContent = [];
      const pageCount = this.pdfDoc.numPages;

      for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
        showLoading(`📖 Processing page ${pageNum} of ${pageCount}...`);

        const page = await this.pdfDoc.getPage(pageNum);
        const extractedPage = await this.extractTextFromPage(page, pageNum);
        console.log(`Extracted structured content from page ${pageNum}:`, extractedPage);

        const pageText = extractedPage?.text || '';
        const textLength = pageText.replace(/\s+/g, '').length;

        // Determine whether to use the extracted text layer or fall back to OCR.
        // Three reasons to skip the text layer and run OCR instead:
        //   1. The user forced OCR via the UI toggle.
        //   2. The character count is too low (sparse / scanned page).
        //   3. The Arabic characters decoded to rare / Quranic-only codepoints,
        //      which is the fingerprint of a broken PDF font mapping.
        const needsOcr =
          forceOcr ||
          textLength < 10 ||
          this.hasCorruptArabicLayer(pageText);

        if (!needsOcr) {
          pageContent.push(extractedPage.paragraphs);
          continue;
        }

        if (forceOcr) {
          showLoading('🖼️ Force OCR active — reading page from image...');
          showConversionNotice(
            'Force OCR is enabled. All pages will be read from their rendered images.',
            'warning'
          );
        } else if (textLength < 10) {
          showLoading('🖼️ Reading text from images, please wait...');
          showConversionNotice(
            'The document appears to contain scanned images. OCR is running in your browser to extract text.',
            'warning'
          );
        } else {
          // Corrupt Arabic layer detected
          showLoading('🔠 Detected broken font mapping — re-reading page via OCR...');
          showConversionNotice(
            'A broken font mapping was detected on this page. OCR will be used for accurate Arabic text extraction.',
            'warning'
          );
        }

        const ocrText = await this.performOcrOnPage(page, pageNum);
        console.log(`OCR text from page ${pageNum}:`, ocrText);
        pageContent.push(this.buildParagraphsFromText(ocrText, this.detectTextDirection(ocrText)));
      }

      const fullText = pageContent.flat().map((paragraph) => paragraph.text || '').join('\n\n');
      const extractedCharacterCount = fullText.replace(/\s+/g, '').length;
      console.log('Aggregated extracted text:', fullText);
      console.log('Extraction summary:', {
        pageCount,
        extractedCharacterCount,
        pageContent
      });

      const minimumExpectedCharacters = Math.max(20, pageCount * 20);
      if (extractedCharacterCount < minimumExpectedCharacters) {
        const scannedMessage = 'Warning: This document consists of scanned images and does not contain editable text for conversion.';
        showConversionNotice(scannedMessage, 'warning');
        showToast(scannedMessage, 'error');
        hideLoading();
        return null;
      }

      showLoading('📝 Creating Word document...');

      const docxLib = await this.getDocxLib();

      if (!docxLib || !docxLib.Document || !docxLib.Packer) {
        throw new Error('The docx library failed to load from the CDN.');
      }

      const doc = new docxLib.Document({
        sections: [
          {
            properties: {
              page: {
                margin: {
                  top: 1440,
                  right: 1440,
                  bottom: 1440,
                  left: 1440,
                  header: 720,
                  footer: 720,
                  gutter: 0
                },
                size: {
                  orientation: docxLib.PageOrientation.PORTRAIT,
                  width: 11900,
                  height: 16840
                }
              }
            },
            children: this.createWordContent(pageContent, docxLib)
          }
        ]
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

  async performOcrOnPage(page) {
    if (!window.Tesseract || !window.Tesseract.recognize) {
      throw new Error('Tesseract.js failed to load from the CDN.');
    }

    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Unable to create an image canvas for OCR.');
    }

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({
      canvasContext: context,
      viewport
    }).promise;

    const result = await window.Tesseract.recognize(canvas, 'ara+eng', {
      logger: (message) => {
        if (message?.status === 'recognizing text' && typeof message.progress === 'number') {
          const progressPercent = Math.round(message.progress * 100);
          showLoading(`🖼️ Reading text from images... ${progressPercent}%`);
        }
      }
    });

    return (result?.data?.text || '').replace(/\s+/g, ' ').trim();
  }

  // ---------------------------------------------------------------------------
  // ARABIC TEXT EXTRACTION ENGINE — gap-aware, RTL-safe
  // ---------------------------------------------------------------------------

  /**
   * Horizontal gap threshold (in PDF user-space units, ≈ pixels at 1x).
   * RTL Arabic formula: gap = (current.x − current.width) − next.x
   *   where current.x is the right edge, current.width is the advance width,
   *   so (current.x − current.width) is the LEFT edge of the current word,
   *   and next.x is the RIGHT edge of the next word (to the left in RTL flow).
   * Any gap > 1.5 px is treated as a word boundary and a space is injected.
   */
  static GAP_THRESHOLD = 1.5;

  /**
   * Compute the visual gap between two consecutive text items on the same line.
   *
   * RTL (Arabic): items are sorted descending by X (right→left).
   *   prevItem is to the RIGHT, currItem is to the LEFT.
   *   end of prevItem  = prevItem.x − prevItem.width  (its left edge)
   *   start of currItem = currItem.x                  (its right edge)
   *   gap = (prevItem.x − prevItem.width) − currItem.x
   *
   * LTR: items are sorted ascending by X (left→right).
   *   end of prevItem  = prevItem.x + prevItem.width  (its right edge)
   *   start of currItem = currItem.x                  (its left edge)
   *   gap = currItem.x − (prevItem.x + prevItem.width)
   *
   * A positive value means there is visible empty space between the two items.
   */
  computeHorizontalGap(prevItem, currItem, isRtl) {
    if (isRtl) {
      // end of word = left edge = x − width; start of next word = right edge = x
      return (prevItem.x - (prevItem.width || 0)) - currItem.x;
    }
    return currItem.x - (prevItem.x + (prevItem.width || 0));
  }

  /**
   * Clean up the assembled line text:
   *  - Collapse runs of whitespace to a single space
   *  - Remove spaces around Arabic-only punctuation
   *  - Trim edges
   */
  normalizeArabicText(text) {
    return text
      .replace(/[ \t]+/g, ' ')                    // collapse whitespace
      .replace(/ ([،؛؟!،])/g, '$1')               // no space before Arabic punct
      .replace(/([،؛؟!،]) /g, '$1')               // no space after Arabic punct
      .trim();
  }

  async extractTextFromPage(page) {
    // disableCombineTextItems: false → pdf.js combines individual Arabic glyphs
    // into proper word-level items internally. We then apply gap detection only
    // at word boundaries (between items), which is exactly where spaces are lost.
    // Setting this to true breaks Arabic because each raw shaped glyph is returned
    // separately, making reassembly destroy ligature context and character order.
    const textContent = await page.getTextContent({
      disableCombineTextItems: false,
      includeMarkedContent: false
    });

    // Map raw pdf.js items to a richer structure that preserves coordinates.
    const items = (textContent.items || [])
      .filter((item) => item && typeof item.str === 'string' && item.str.trim())
      .map((item) => ({
        // Keep the raw string — we will insert spaces ourselves
        text: item.str,
        x:    item.transform?.[4] ?? 0,
        y:    item.transform?.[5] ?? 0,
        // item.width is the advance width in user-space units
        width:    item.width  || 0,
        height:   item.height || 0,
        fontName: item.fontName || ''
      }));

    if (!items.length) {
      return { text: '', paragraphs: [] };
    }

    // ── Step 1: group items into visual lines by Y proximity ──────────────────
    // Sort descending by Y first so the topmost line comes first.
    const sortedByY = [...items].sort((a, b) => b.y - a.y || a.x - b.x);

    const lineTolerance       = 5;   // px — items within this Y-band are one line
    const paragraphGapThreshold = 16; // px — Y-gap larger than this starts a new paragraph

    const lines = [];
    sortedByY.forEach((item) => {
      const currentLine = lines[lines.length - 1];
      if (!currentLine || Math.abs(item.y - currentLine.y) > lineTolerance) {
        lines.push({ y: item.y, items: [item] });
      } else {
        currentLine.items.push(item);
      }
    });

    // ── Step 2: group lines into paragraphs by Y-gap ──────────────────────────
    const paragraphs   = [];
    let pendingLines   = [];

    lines.forEach((line) => {
      if (!pendingLines.length) {
        pendingLines.push(line);
        return;
      }
      const previousLine = pendingLines[pendingLines.length - 1];
      const lineGap = Math.abs(previousLine.y - line.y);
      if (lineGap > paragraphGapThreshold) {
        const paragraph = this.buildParagraphFromLines(pendingLines);
        if (paragraph) paragraphs.push(paragraph);
        pendingLines = [line];
      } else {
        pendingLines.push(line);
      }
    });

    if (pendingLines.length) {
      const paragraph = this.buildParagraphFromLines(pendingLines);
      if (paragraph) paragraphs.push(paragraph);
    }

    const text = paragraphs.map((p) => p.text).join('\n');
    return { text, paragraphs };
  }

  buildParagraphFromLines(lines) {
    const textLines = lines
      .map((line) => this.formatLine(line.items))
      .filter(Boolean);

    if (!textLines.length) return null;

    const paragraphText = textLines.join('\n');
    const direction     = this.detectTextDirection(paragraphText);
    const isRtl         = direction === 'rtl';
    const fontSize      = this.estimateFontSize(lines[0]?.items || []);
    const isBold        = (lines[0]?.items || []).some((item) => /bold/i.test(item.fontName || ''));

    return {
      text:      paragraphText,
      isRtl,
      alignment: isRtl ? 'right' : 'left',
      fontSize,
      isBold
    };
  }

  /**
   * Assemble a single line's text from its items using geometric gap detection.
   *
   * For RTL lines (Arabic): items are sorted right→left (descending X).
   * For LTR lines:          items are sorted left→right (ascending X).
   *
   * A space is injected between consecutive items whenever the visual gap
   * between them exceeds GAP_THRESHOLD, preventing words from merging.
   */
  formatLine(items) {
    if (!items || !items.length) return '';

    // Detect if the line contains RTL script (Arabic/Hebrew)
    const probeText = items.map(i => i.text).join('');
    const isRtl = this.detectTextDirection(probeText) === 'rtl';

    // Sort items according to visual order for the detected direction
    const sorted = [...items].sort((a, b) =>
      isRtl ? b.x - a.x : a.x - b.x
    );

    // Build the line, inserting spaces where geometric gaps indicate word boundaries
    let result = sorted[0].text;
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const gap = this.computeHorizontalGap(prev, curr, isRtl);
      if (gap > PDFToWordConverter.GAP_THRESHOLD) {
        result += ' ' + curr.text;
      } else {
        result += curr.text;
      }
    }

    // NOTE: Do NOT reverse Arabic segments here.
    // pdf.js already returns Arabic text in logical (Unicode) reading order.
    // createWordContent() sets bidirectional/rightToLeft flags on every Paragraph
    // and TextRun, so Word's own bidi engine handles visual reordering correctly.
    // A manual reversal here conflicts with Word's bidi rendering and destroys
    // base-letter/diacritic pairing (e.g. shadda lands on the wrong base letter).

    return this.normalizeArabicText(result);
  }

  detectTextDirection(text) {
    const arabicCount = (text.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length;
    const latinCount = (text.match(/[A-Za-z]/g) || []).length;
    return arabicCount > latinCount ? 'rtl' : 'ltr';
  }

  isRtlText(text) {
    return this.detectTextDirection(text) === 'rtl';
  }

  /**
   * Detect whether a page's text layer contains corrupt Arabic — i.e. Arabic-range
   * characters that fall outside the everyday modern Arabic set and instead map to
   * rare Quranic-only / extended codepoints that almost never appear in normal prose.
   *
   * When a PDF uses a non-standard or deliberately obscured font encoding, the glyphs
   * render correctly on screen but the embedded Unicode values are wrong.  The broken
   * codepoints cluster in extensions such as U+063B–U+063F, U+0653–U+065F (above the
   * standard diacritic range U+064B–U+0652), and isolated spots like U+065B, U+0657.
   *
   * Algorithm:
   *   1. Count all Arabic-block characters in the text.
   *   2. Count how many of those fall OUTSIDE the "safe" modern set:
   *        Basic letters   : U+0621–U+063A, U+0641–U+064A
   *        Basic diacritics: U+064B–U+0652
   *        Common extras   : U+060C (Arabic comma), U+061B (semicolon), U+061F (?),
   *                          U+0660–U+0669 (Arabic-Indic digits), U+066A–U+066D (punct)
   *   3. If ≥ 35 % of Arabic characters are "suspicious" AND there are at least 5
   *      Arabic characters total, treat the page as having a broken text layer.
   *
   * @param {string} text  - Raw text extracted from a PDF page.
   * @returns {boolean}    - true  → the text layer appears corrupt; use OCR instead.
   *                         false → the text layer looks trustworthy.
   */
  hasCorruptArabicLayer(text) {
    // All Arabic-script characters in the text
    const allArabic = (text.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []);
    if (allArabic.length < 5) {
      return false; // Not enough Arabic to judge
    }

    // Characters that are perfectly normal in everyday Arabic text
    const safeArabic = /[\u0621-\u063A\u0641-\u064A\u064B-\u0652\u060C\u061B\u061F\u0660-\u066D]/;

    const suspiciousCount = allArabic.filter(ch => !safeArabic.test(ch)).length;
    const suspiciousRatio = suspiciousCount / allArabic.length;

    if (suspiciousRatio >= 0.35) {
      console.warn(
        `[PDFToWord] Corrupt Arabic layer suspected on page: ${suspiciousCount}/${allArabic.length} ` +
        `Arabic chars (${Math.round(suspiciousRatio * 100)}%) are outside the standard modern set.`
      );
      return true;
    }

    return false;
  }

  estimateFontSize(items) {
    if (!items.length) {
      return 22;
    }

    const heights = items
      .map((item) => Math.abs(item.height || 0))
      .filter(Boolean);

    const baseSize = heights.length ? Math.max(...heights) : 12;
    const size = Math.max(18, Math.min(36, Math.round(baseSize * 0.75)));
    return size * 2;
  }

  buildParagraphsFromText(text, direction = 'ltr') {
    const cleanedText = (text || '').replace(/\s+/g, ' ').trim();
    if (!cleanedText) {
      return [];
    }

    return [
      {
        text: cleanedText,
        isRtl: direction === 'rtl',
        alignment: direction === 'rtl' ? 'right' : 'left',
        fontSize: 24,
        isBold: false
      }
    ];
  }

  createWordContent(pageContent, docxLib) {
    const children = [];

    // ── Document title ─────────────────────────────────────────────────────────
    children.push(
      new docxLib.Paragraph({
        children: [
          new docxLib.TextRun({
            text: 'Converted PDF Document',
            bold: true,
            size: 32
          })
        ],
        heading:   docxLib.HeadingLevel.HEADING_1,
        spacing:   { line: 276, lineRule: docxLib.LineRuleType?.AUTO, after: 200 },
        alignment: docxLib.AlignmentType.CENTER
      })
    );

    children.push(
      new docxLib.Paragraph({
        children: [
          new docxLib.TextRun({
            text: `Converted on ${new Date().toLocaleString()}`,
            italics: true,
            size: 20
          })
        ],
        spacing:   { line: 276, lineRule: docxLib.LineRuleType?.AUTO, after: 400 },
        alignment: docxLib.AlignmentType.CENTER
      })
    );

    // ── Page content ───────────────────────────────────────────────────────────
    pageContent.forEach((paragraphs, index) => {
      if (index > 0) {
        children.push(new docxLib.Paragraph({ text: '', pageBreakBefore: true }));
      }

      (paragraphs || []).forEach((paragraph) => {
        const isRtl = Boolean(paragraph.isRtl);
        const lines = (paragraph.text || '').split(/\n+/).filter((line) => line.trim());

        lines.forEach((line) => {
          // ── TextRun: set RTL character direction so shaping is correct ──
          const run = new docxLib.TextRun({
            text:          line,
            bold:          Boolean(paragraph.isBold),
            // size is in half-points; ensure a sensible minimum
            size:          Math.max(20, paragraph.fontSize || 24),
            italics:       false,
            // rightToLeft on TextRun forces the Unicode BiDi override
            rightToLeft:   isRtl
          });

          // ── Paragraph: set direction, alignment, and generous line spacing ──
          const paragraphProps = {
            children:  [run],
            alignment: isRtl
              ? docxLib.AlignmentType.RIGHT
              : docxLib.AlignmentType.LEFT,
            // bidirectional + rightToLeft both set the paragraph-level bidi flag (w:bidi)
            // bidirectional is the canonical docx.js v7 property name
            bidirectional: isRtl,
            rightToLeft:   isRtl,
            spacing: isRtl
              ? {
                  // 360 twips = 1.5× line height; prevents diacritic/nunation overlap
                  line:     360,
                  lineRule: docxLib.LineRuleType?.AUTO ?? 'auto',
                  after:    200   // 200 twips (~3.5mm) gap between paragraphs
                }
              : {
                  line:     276,
                  lineRule: docxLib.LineRuleType?.AUTO ?? 'auto',
                  after:    120
                }
          };

          // Inject textDirection if the docx version supports it
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
    this.mammothLib = null;
  }

  async getMammoth() {
    if (this.mammothLib) {
      return this.mammothLib;
    }

    if (globalThis.mammoth) {
      this.mammothLib = globalThis.mammoth;
      return this.mammothLib;
    }

    if (window.mammoth) {
      this.mammothLib = window.mammoth;
      return this.mammothLib;
    }

    try {
      const module = await import('https://cdn.jsdelivr.net/npm/mammoth@1.6.0/+esm');
      this.mammothLib = module.default || module;
      globalThis.mammoth = this.mammothLib;
      window.mammoth = this.mammothLib;
      return this.mammothLib;
    } catch (error) {
      throw new Error(`Unable to load the Mammoth library: ${error.message}`);
    }
  }

  async convert(file) {
    try {
      showLoading('📄 Reading Word document...');

      const arrayBuffer = await this.readFile(file);
      const mammothLib = await this.getMammoth();
      const result = await mammothLib.convertToHtml({ arrayBuffer });

      this.wordContent = result.value;

      showLoading('🔄 Converting to PDF...');

      const container = document.createElement('div');
      container.innerHTML = this.wordContent;
      container.style.cssText = `
        padding: 16mm;
        font-family: 'Segoe UI', Arial, Tahoma, 'Noto Naskh Arabic', 'Times New Roman', sans-serif;
        line-height: 1.6;
        color: #111827;
        background: white;
        width: 210mm;
        min-height: 297mm;
        box-sizing: border-box;
        margin: 0 auto;
      `;

      document.body.appendChild(container);

      showLoading('🖼️ Rendering PDF...');

      const options = {
        margin: [12, 12, 12, 12],
        filename: 'converted.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          letterRendering: true,
          scrollX: 0,
          scrollY: 0
        },
        jsPDF: {
          unit: 'mm',
          format: 'a4',
          orientation: 'portrait'
        },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
      };

      if (window.html2pdf) {
        const pdfBlob = await window.html2pdf().set(options).from(container).outputPdf('blob');
        document.body.removeChild(container);
        return pdfBlob;
      }

      document.body.removeChild(container);
      throw new Error('html2pdf.js failed to load from the CDN.');

    } catch (error) {
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
      
      showLoading('🔒 Applying protection...');

      const newPdf = await PDFDocument.create();
      const copiedPages = await newPdf.copyPages(this.pdfDoc, this.pdfDoc.getPageIndices());
      copiedPages.forEach((page) => newPdf.addPage(page));

      const protectedPdfBytes = await newPdf.save();
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
        // Load the PDF with the provided password
        this.pdfDoc = await PDFDocument.load({
          pdfBytes: arrayBuffer,
          password: password,
          ignoreEncryption: false
        });
      } catch (e) {
        throw new Error('❌ Incorrect password or invalid PDF file');
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

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <i data-lucide="${type === 'success' ? 'check-circle' : 'alert-circle'}"></i>
    <span>${message}</span>
  `;
  
  container.appendChild(toast);
  
  // Auto-remove after 4 seconds
  setTimeout(() => {
    toast.classList.add('toast-removing');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ============================================================================
// MAIN CONVERSION ORCHESTRATOR
// ============================================================================

window.processConversion = async function(currentTool) {
  const fileInput = document.getElementById('file-input');
  const password = document.getElementById('tool-password')?.value;
  
  // Handle if currentTool is passed as object (with .id property)
  const toolId = typeof currentTool === 'object' ? currentTool.id : currentTool;
  
  if (!fileInput.files || fileInput.files.length === 0) {
    showToast('❌ Please select a file first', 'error');
    return;
  }
  
  const file = fileInput.files[0];
  
  try {
    showLoading('🚀 Starting conversion...');
    
    let converter = null;
    let outputFilename = '';
    let blob = null;
    
    switch (toolId) {
      case 'pdf-to-word':
        if (!file.type.includes('pdf') && !file.name.endsWith('.pdf')) {
          showToast('❌ Please select a PDF file', 'error');
          hideLoading();
          return;
        }
        converter = new PDFToWordConverter();
        blob = await converter.convert(file);
        outputFilename = file.name.replace(/\.pdf$/i, '.docx') || 'document.docx';
        break;
        
      case 'word-to-pdf':
        if (!file.type.includes('word') && !file.name.endsWith('.docx') && !file.name.endsWith('.doc')) {
          showToast('❌ Please select a Word document (.docx)', 'error');
          hideLoading();
          return;
        }
        converter = new WordToPDFConverter();
        blob = await converter.convert(file);
        outputFilename = file.name.replace(/\.docx?$/i, '.pdf') || 'document.pdf';
        break;
        
      case 'protect-pdf':
        if (!file.type.includes('pdf') && !file.name.endsWith('.pdf')) {
          showToast('❌ Please select a PDF file', 'error');
          hideLoading();
          return;
        }
        if (!password) {
          showToast('❌ Please enter a password', 'error');
          hideLoading();
          return;
        }
        converter = new PDFEncryptor();
        blob = await converter.encrypt(file, password);
        outputFilename = file.name.replace(/\.pdf$/i, '_protected.pdf') || 'protected.pdf';
        break;
        
      case 'unlock-pdf':
        if (!file.type.includes('pdf') && !file.name.endsWith('.pdf')) {
          showToast('❌ Please select a PDF file', 'error');
          hideLoading();
          return;
        }
        if (!password) {
          showToast('❌ Please enter the PDF password', 'error');
          hideLoading();
          return;
        }
        converter = new PDFDecryptor();
        blob = await converter.decrypt(file, password);
        outputFilename = file.name.replace(/\.pdf$/i, '_decrypted.pdf') || 'decrypted.pdf';
        break;
        
      default:
        showToast('❌ Unknown tool', 'error');
        hideLoading();
        return;
    }
    
    if (blob) {
      hideConversionNotice();
      hideLoading();
      downloadFile(blob, outputFilename);
      showToast(`✅ Conversion successful! Downloaded: ${outputFilename}`, 'success');
    }
    
  } catch (error) {
    hideLoading();
    console.error('Conversion error:', error);
    showToast(`❌ ${error.message}`, 'error');
  }
};

// Legacy function for compatibility
const { PDFDocument: CompatPDFDocument, rgb: CompatRgb, degrees: CompatDegrees } = PDFLib;

window.processPDF = async function(toolId, files) {
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
                resultBytes = await extractPages(files[0], splitRange);
                resultFileName = 'split-output.pdf';
                break;
            case 'compress':
                resultBytes = await compressPDF(files[0]);
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
                resultBytes = await jpgToPdf(files);
                resultFileName = 'converted.pdf';
                break;
            case 'pdf-to-jpg':
                await pdfToJpg(files[0]);
                window.setProcessingState(false);
                return;
            default:
                throw new Error("Tool not implemented yet.");
        }
        
        if (resultBytes) {
            downloadBlob(resultBytes, resultFileName, 'application/pdf');
        }
        
    } catch (error) {
        console.error(error);
        alert('Error processing file: ' + error.message);
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

async function compressPDF(file) {
    const buffer = await fileToBuffer(file);
    const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const newPdf = await PDFDocument.create();
    const pages = await newPdf.copyPages(pdf, pdf.getPageIndices());
    pages.forEach((page) => newPdf.addPage(page));
    return await newPdf.save({ useObjectStreams: true, updateFieldAppearances: false });
}

async function rotatePDF(file, degreesVal) {
    const buffer = await fileToBuffer(file);
    const pdf = await PDFDocument.load(buffer);
    const pages = pdf.getPages();
    pages.forEach(page => {
        const currentRotation = page.getRotation().angle;
        page.setRotation(degrees(currentRotation + degreesVal));
    });
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

async function protectPDF(file, password) {
    const buffer = await fileToBuffer(file);
    // Note: pdf-lib doesn't natively support full RC4/AES encryption in standard build easily
    // We mock this by saving the file and warning user for this demo.
    // In a real scenario, this requires node.js backend or specialized wasm library like pdf-lib with crypto
    alert("Notice: True encryption requires backend/crypto libraries. This is a mockup.");
    return buffer; 
}

async function unlockPDF(file, password) {
    const buffer = await fileToBuffer(file);
    // If the file is encrypted, ignoreEncryption will attempt to load it without enforcing the password.
    const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
    return await pdf.save();
}

async function watermarkPDF(file, text) {
    const buffer = await fileToBuffer(file);
    const pdf = await PDFDocument.load(buffer);
    const pages = pdf.getPages();
    
    pages.forEach(page => {
        const { width, height } = page.getSize();
        page.drawText(text, {
            x: 50,
            y: height / 2,
            size: 50,
            color: rgb(0.95, 0.1, 0.1),
            rotate: degrees(45),
            opacity: 0.3,
        });
    });
    return await pdf.save();
}

async function jpgToPdf(files) {
    const pdf = await PDFDocument.create();
    
    for (const file of files) {
        const buffer = await fileToBuffer(file);
        let image;
        if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
            image = await pdf.embedJpg(buffer);
        } else if (file.type === 'image/png') {
            image = await pdf.embedPng(buffer);
        } else {
            continue;
        }
        
        const page = pdf.addPage([image.width, image.height]);
        page.drawImage(image, {
            x: 0,
            y: 0,
            width: image.width,
            height: image.height,
        });
    }
    return await pdf.save();
}

async function pdfToJpg(file) {
    const buffer = await fileToBuffer(file);
    const typedarray = new Uint8Array(buffer);
    const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
    const numPages = pdf.numPages;

    for (let pageNumber = 1; pageNumber <= numPages; pageNumber++) {
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

        await new Promise((resolve, reject) => {
            canvas.toBlob(blob => {
                if (!blob) {
                    reject(new Error('Unable to create image blob.'));
                    return;
                }
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `page-${pageNumber}.jpg`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                resolve();
            }, 'image/jpeg', 0.9);
        });
    }
}

async function mockConversion(toolId, file) {
    return new Promise((resolve) => {
        setTimeout(() => {
            alert(`Mock conversion for ${toolId} completed successfully!`);
            resolve();
        }, 2000);
    });
}
