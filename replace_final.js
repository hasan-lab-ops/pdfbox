const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'main.js');
let code = fs.readFileSync(filePath, 'utf8');

// Exact markers for the function boundaries
const START_MARKER = 'async function convertPDFToWord(arrayBuffer) {';
const END_MARKER = '  return docx.Packer.toBlob(doc);\n}';

const startIndex = code.indexOf(START_MARKER);
if (startIndex === -1) { console.error('START MARKER NOT FOUND'); process.exit(1); }

const endIndex = code.indexOf(END_MARKER, startIndex) + END_MARKER.length;
if (endIndex < END_MARKER.length) { console.error('END MARKER NOT FOUND'); process.exit(1); }

console.log(`Replacing bytes ${startIndex} to ${endIndex}`);

/* ============================================================
   THE NEW COMPLETE IMPLEMENTATION
   ============================================================ */
const newFunc = `async function convertPDFToWord(arrayBuffer) {
  // ── Library guards ──────────────────────────────────────────────────────────
  if (typeof pdfjsLib === 'undefined') throw new Error('PDF.js library is not loaded.');
  if (typeof docx === 'undefined')    throw new Error('docx.js library is not loaded.');

  // ── Constants ────────────────────────────────────────────────────────────────
  const RENDER_SCALE = 2.5;          // High-DPI render for accurate colour sampling
  const LINE_Y_TOL   = 4;            // pts — two items within this Y distance share a line
  const MIN_IMG_DIM  = 24;           // pts — ignore tiny blobs (artefacts / bullets)
  const MAX_DOC_IMG_W = 500;         // px  — max image width inside Word doc

  // Matches Arabic Unicode blocks (comprehensive)
  const ARABIC_RE = /[\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFD\\uFE70-\\uFEFF]/;

  // ── Helpers ──────────────────────────────────────────────────────────────────

  /** Canvas → PNG Uint8Array */
  const canvasToPng = (c) =>
    new Promise((res, rej) =>
      c.toBlob(
        async (b) => b ? res(new Uint8Array(await b.arrayBuffer())) : rej(new Error('toBlob failed')),
        'image/png'
      )
    );

  /**
   * Sample the dominant non-white pixel colour inside a canvas rectangle.
   * Returns a 6-char hex string (e.g. "1a2b3c").
   */
  const sampleHex = (ctx, cx, cy, cw, ch) => {
    const x0 = Math.max(0, Math.floor(cx));
    const y0 = Math.max(0, Math.floor(cy));
    const w  = Math.max(1, Math.min(Math.ceil(cw),  ctx.canvas.width  - x0));
    const h  = Math.max(1, Math.min(Math.ceil(ch),  ctx.canvas.height - y0));
    if (w <= 0 || h <= 0) return '000000';
    const px = ctx.getImageData(x0, y0, w, h).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < px.length; i += 4) {
      const a = px[i + 3];
      if (a < 30) continue;                          // skip transparent
      if (px[i] > 240 && px[i+1] > 240 && px[i+2] > 240) continue; // skip white
      r += px[i]; g += px[i+1]; b += px[i+2]; n++;
    }
    if (!n) return '000000';
    return [r, g, b].map(v => Math.round(v / n).toString(16).padStart(2, '0')).join('');
  };

  /**
   * Concatenate two 3×3 affine matrices stored as [a,b,c,d,e,f].
   * (PDF column-major convention: M_out = M_a × M_b)
   */
  const mulMat = (a, b) => [
    a[0]*b[0] + a[1]*b[2],  a[0]*b[1] + a[1]*b[3],
    a[2]*b[0] + a[3]*b[2],  a[2]*b[1] + a[3]*b[3],
    a[4]*b[0] + a[5]*b[2] + b[4],
    a[4]*b[1] + a[5]*b[3] + b[5]
  ];

  /**
   * Transform a PDF-space point [px, py] (Y-up, origin = bottom-left)
   * through a CTM to PDF-space then convert to canvas-space (Y-down).
   * pageH is the page height in PDF points (not scaled).
   */
  const pdfPtToCanvas = (px, py, ctm, pageH, scale) => ({
    x: (ctm[0]*px + ctm[2]*py + ctm[4]) * scale,
    y: (pageH - (ctm[1]*px + ctm[3]*py + ctm[5])) * scale
  });

  /**
   * Detect whether a line of text is purely RTL/Arabic.
   * We check the dominant character script rather than any single character.
   */
  const detectArabic = (str) => {
    const arabicChars  = (str.match(ARABIC_RE) || []).length;
    const latinChars   = (str.match(/[a-zA-Z]/) || []).length;
    return arabicChars > latinChars;
  };

  /**
   * Split a mixed Arabic-Latin string into typed segments.
   * Each segment carries its own text, script type, and metadata.
   */
  const tokeniseMixed = (str) => {
    const parts = [];
    const re = /([\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFD\\uFE70-\\uFEFF\\s]+)|([^\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFD\\uFE70-\\uFEFF]+)/g;
    let m;
    while ((m = re.exec(str)) !== null) {
      if (!m[0].trim() && m[0] !== ' ') continue; // skip pure whitespace except spaces
      parts.push({ text: m[0], isArabic: ARABIC_RE.test(m[0]) });
    }
    return parts;
  };

  /**
   * Convert PDF font-size points to docx half-points (Word's "size" unit).
   * Clamp to readable range 16–144 hp (8–72 pt).
   */
  const ptToHalfPt = (pt) => Math.max(16, Math.min(144, Math.round(Math.abs(pt) * 2)));

  // ── Progress helpers ─────────────────────────────────────────────────────────
  const prog = (pct, msg) => { if (typeof setProgress === 'function') setProgress('pdf2word', pct, msg); };

  prog(8, 'Loading PDF...');

  const pdfDoc = await pdfjsLib.getDocument({
    data: arrayBuffer,
    cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/standard_fonts/'
  }).promise;

  const numPages   = pdfDoc.numPages;
  const allChildren = [];

  // ── Per-page processing ──────────────────────────────────────────────────────
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    prog(
      10 + Math.floor((pageNum - 1) / numPages * 80),
      'Processing page ' + pageNum + ' / ' + numPages + '...'
    );

    const page     = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const pageW_pt = page.view[2]; // page width  in PDF points (unscaled)
    const pageH_pt = page.view[3]; // page height in PDF points (unscaled)
    const canvasW  = Math.round(pageW_pt * RENDER_SCALE);
    const canvasH  = Math.round(pageH_pt * RENDER_SCALE);

    // ── 1. Render the page to a canvas (needed for colour sampling) ────────────
    const canvas = document.createElement('canvas');
    canvas.width  = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasW, canvasH);
    await page.render({ canvasContext: ctx, viewport }).promise;

    // ── 2. Parse the operator list ─────────────────────────────────────────────
    //    We collect: embedded raster images, AND whole-page vector regions.
    const extractedImages = []; // { pdfY_top, pdfH, pdfW, pdfX, imgU8, dispW, dispH }
    const underlineRects  = []; // { x0, x1, y (PDF-space, Y-up) }
    const seenImgKeys     = new Set();

    try {
      const OPS    = pdfjsLib.OPS;
      const opList = await page.getOperatorList();

      const PAINT_OPS = new Set([
        OPS.paintImageXObject,
        OPS.paintImageXObjectRepeat,
        OPS.paintJpegXObject,
        OPS.paintInlineImageXObject
      ]);
      // Filled path ops (thin filled rectangles = underlines / borders)
      const FILL_OPS  = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke]);
      const STROKE_OPS = new Set([OPS.stroke, OPS.fillStroke, OPS.eoFillStroke]);

      let ctm        = [1, 0, 0, 1, 0, 0];
      const ctmStack = [];
      let pathCmds   = []; // accumulate current path segments
      let curX = 0, curY = 0;

      for (let i = 0; i < opList.fnArray.length; i++) {
        const fn   = opList.fnArray[i];
        const args = opList.argsArray[i];

        // ── CTM management ──────────────────────────────────────────────────────
        if (fn === OPS.save) {
          ctmStack.push([...ctm]);
        } else if (fn === OPS.restore) {
          if (ctmStack.length) ctm = ctmStack.pop(); else ctm = [1,0,0,1,0,0];
        } else if (fn === OPS.transform) {
          ctm = mulMat(ctm, args);

        // ── Path construction ───────────────────────────────────────────────────
        } else if (fn === OPS.beginPath) {
          pathCmds = []; curX = 0; curY = 0;
        } else if (fn === OPS.moveTo) {
          curX = args[0]; curY = args[1];
          pathCmds.push({ op: 'M', x: curX, y: curY });
        } else if (fn === OPS.lineTo) {
          curX = args[0]; curY = args[1];
          pathCmds.push({ op: 'L', x: curX, y: curY });
        } else if (fn === OPS.closePath) {
          if (pathCmds.length) {
            pathCmds.push({ op: 'Z' });
          }
        } else if (fn === OPS.rectangle) {
          // args: [x, y, w, h]
          pathCmds.push({ op: 'R', x: args[0], y: args[1], w: args[2], h: args[3] });
          curX = args[0]; curY = args[1];

        // ── Path stroking / filling ─────────────────────────────────────────────
        } else if (FILL_OPS.has(fn) || STROKE_OPS.has(fn)) {
          // Analyse collected path segments
          for (const cmd of pathCmds) {
            if (cmd.op === 'R') {
              // Transform the rectangle into PDF absolute space
              const rx0  = ctm[0]*cmd.x       + ctm[2]*cmd.y       + ctm[4];
              const ry0  = ctm[1]*cmd.x       + ctm[3]*cmd.y       + ctm[5];
              const rx1  = ctm[0]*(cmd.x+cmd.w) + ctm[2]*(cmd.y+cmd.h) + ctm[4];
              const ry1  = ctm[1]*(cmd.x+cmd.w) + ctm[3]*(cmd.y+cmd.h) + ctm[5];
              const rW   = Math.abs(rx1 - rx0);
              const rH   = Math.abs(ry1 - ry0);
              const rTop = Math.max(ry0, ry1); // PDF Y-up: higher value = visually higher
              const rLeft= Math.min(rx0, rx1);
              // If thin & wide → underline candidate
              if (rH <= 2.5 && rW >= 10) {
                underlineRects.push({ x0: rLeft, x1: rLeft + rW, y: rTop });
              }
            }
          }
          // Build a 2-point polyline check for stroked lines
          let lastPx = null, lastPy = null;
          for (const cmd of pathCmds) {
            if (cmd.op === 'M') { lastPx = cmd.x; lastPy = cmd.y; }
            else if (cmd.op === 'L') {
              if (lastPx !== null) {
                const ax = ctm[0]*lastPx + ctm[2]*lastPy + ctm[4];
                const ay = ctm[1]*lastPx + ctm[3]*lastPy + ctm[5];
                const bx = ctm[0]*cmd.x  + ctm[2]*cmd.y  + ctm[4];
                const by = ctm[1]*cmd.x  + ctm[3]*cmd.y  + ctm[5];
                const dx = Math.abs(bx - ax), dy = Math.abs(by - ay);
                if (dy <= 1.5 && dx >= 10) { // horizontal stroke
                  underlineRects.push({ x0: Math.min(ax,bx), x1: Math.max(ax,bx), y: Math.max(ay,by) });
                }
              }
              lastPx = cmd.x; lastPy = cmd.y;
            }
          }
          pathCmds = [];

        // ── Raster image painting ───────────────────────────────────────────────
        } else if (PAINT_OPS.has(fn)) {
          const imgRef = args[0];
          if (!imgRef) continue;
          // Deduplicate images that appear multiple times (e.g. tiled backgrounds)
          const imgKey = typeof imgRef === 'string' ? imgRef : ('obj_' + i);
          if (seenImgKeys.has(imgKey)) continue;
          seenImgKeys.add(imgKey);

          // Compute display rect in PDF points
          const [a, b, c, d, e, f] = ctm;
          const corners = [[e,f],[a+e,b+f],[c+e,d+f],[a+c+e,b+d+f]];
          const xs = corners.map(p => p[0]);
          const ys = corners.map(p => p[1]);
          const pdfX  = Math.min(...xs);
          const pdfY  = Math.min(...ys);
          const pdfW  = Math.max(...xs) - pdfX;
          const pdfH  = Math.max(...ys) - pdfY;

          if (pdfW < MIN_IMG_DIM || pdfH < MIN_IMG_DIM) continue;

          try {
            // ── Resolve the image object ──────────────────────────────────────
            let imgObj = null;
            if (fn === OPS.paintInlineImageXObject && args[0] && args[0].data) {
              // Inline image — args[0] already is {width, height, data}
              imgObj = args[0];
            } else if (typeof imgRef === 'object' && imgRef !== null && imgRef.data) {
              imgObj = imgRef;
            } else {
              imgObj = await new Promise(resolve => {
                const timer = setTimeout(() => resolve(null), 800);
                const done  = (v) => { clearTimeout(timer); resolve(v || null); };
                try {
                  if (page.objs.has(imgRef)) {
                    const v = page.objs.get(imgRef, done);
                    if (v !== undefined) done(v);
                  } else if (page.commonObjs && page.commonObjs.has(imgRef)) {
                    const v = page.commonObjs.get(imgRef, done);
                    if (v !== undefined) done(v);
                  } else {
                    // Attempt to get from page resources directly
                    done(null);
                  }
                } catch (_) { done(null); }
              });
            }

            // If we couldn't get the raw bitmap, crop from the already-rendered canvas
            let imgU8 = null;
            if (imgObj) {
              const tw = imgObj.width  || Math.round(pdfW * RENDER_SCALE);
              const th = imgObj.height || Math.round(pdfH * RENDER_SCALE);
              const tmp = document.createElement('canvas');
              tmp.width  = tw; tmp.height = th;
              const tCtx = tmp.getContext('2d');
              tCtx.fillStyle = '#ffffff';
              tCtx.fillRect(0, 0, tw, th);

              if (imgObj instanceof ImageBitmap || imgObj instanceof HTMLImageElement || imgObj instanceof HTMLCanvasElement) {
                tCtx.drawImage(imgObj, 0, 0, tw, th);
              } else if (imgObj.data && imgObj.width && imgObj.height) {
                // Raw RGBA bytes
                const clamped = new Uint8ClampedArray(imgObj.data.length);
                for (let k = 0; k < imgObj.data.length; k++) clamped[k] = imgObj.data[k];
                const imageData = new ImageData(clamped, imgObj.width, imgObj.height);
                tCtx.putImageData(imageData, 0, 0);
              } else if (imgObj.bitmap) {
                tCtx.drawImage(imgObj.bitmap, 0, 0, tw, th);
              }
              imgU8 = await canvasToPng(tmp);
            }

            if (!imgU8) {
              // Fallback: crop from the already-rendered page canvas
              const cx  = Math.max(0, Math.round(pdfX  * RENDER_SCALE));
              const cy  = Math.max(0, Math.round((pageH_pt - pdfY - pdfH) * RENDER_SCALE));
              const cw  = Math.max(1, Math.round(pdfW  * RENDER_SCALE));
              const ch  = Math.max(1, Math.round(pdfH  * RENDER_SCALE));
              if (cx + cw <= canvasW && cy + ch <= canvasH) {
                const crop = document.createElement('canvas');
                crop.width  = cw; crop.height = ch;
                const cCtx  = crop.getContext('2d');
                cCtx.fillStyle = '#ffffff';
                cCtx.fillRect(0, 0, cw, ch);
                cCtx.drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch);
                imgU8 = await canvasToPng(crop);
              }
            }

            if (imgU8) {
              // sortY in PDF coordinate space (Y-up) — higher Y = nearer page top
              extractedImages.push({
                sortY   : pdfY + pdfH,   // top of image in PDF pts (used for sort)
                imgU8,
                dispW   : Math.round(pdfW),
                dispH   : Math.round(pdfH)
              });
            }
          } catch (imgErr) {
            console.warn('[PDF2WORD] image extraction error:', imgErr);
          }
        }
      }
    } catch (opErr) {
      console.warn('[PDF2WORD] getOperatorList error:', opErr);
    }

    // ── 3. Extract text with rich metadata ─────────────────────────────────────
    const textContent = await page.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false });

    /*
     * lineMap: Map<lineKey, Array<token>>
     * lineKey ≈ rawY (PDF Y-up, rounded to LINE_Y_TOL bucket).
     * Each token: { str, x, y, sizePt, fontName, colorHex, hasUnderline }
     */
    const lineMap = new Map();

    for (const item of textContent.items) {
      const str = item.str;
      if (!str || !str.trim()) continue;

      const rawX     = item.transform[4];
      const rawY     = item.transform[5];
      const itemW    = item.width  || 0;
      const itemH    = item.height || 0;

      // Font size: prefer item.height, fall back to transform scale
      const scaleX   = Math.sqrt(item.transform[0]**2 + item.transform[1]**2);
      const scaleY   = Math.sqrt(item.transform[2]**2 + item.transform[3]**2);
      const sizePt   = Math.max(scaleX, scaleY, itemH > 0 ? itemH : 0);
      const finalSizePt = sizePt > 0 ? sizePt : 12;

      // Sample colour from canvas (convert PDF Y-up to canvas Y-down)
      const cX = rawX * RENDER_SCALE;
      const cY = (pageH_pt - rawY - finalSizePt) * RENDER_SCALE;
      const cW = Math.max(1, itemW * RENDER_SCALE);
      const cH = Math.max(1, finalSizePt * RENDER_SCALE);
      const colorHex = sampleHex(ctx, cX, cY, cW, cH);

      // Check underline: look for a thin horizontal line just below this text item.
      // PDF Y-up: the baseline is at rawY, underline is drawn slightly below → rawY - 2 .. rawY + 1
      let hasUnderline = false;
      for (const ul of underlineRects) {
        const overlapX = ul.x0 < rawX + itemW && ul.x1 > rawX;
        const nearY    = ul.y >= (rawY - 5) && ul.y <= (rawY + 3);
        if (overlapX && nearY) { hasUnderline = true; break; }
      }

      const fontName = (item.fontName || '').toLowerCase();

      // Group into lines
      let lineKey = null;
      for (const k of lineMap.keys()) {
        if (Math.abs(k - rawY) <= LINE_Y_TOL) { lineKey = k; break; }
      }
      if (lineKey === null) { lineKey = rawY; lineMap.set(lineKey, []); }
      lineMap.get(lineKey).push({ str, x: rawX, y: rawY, w: itemW, h: finalSizePt, sizePt: finalSizePt, fontName, colorHex, hasUnderline });
    }

    // ── 4. Sort lines top-to-bottom ────────────────────────────────────────────
    const sortedLineKeys = [...lineMap.keys()].sort((a, b) => b - a); // Y-up → descending = top first

    // ── 5. Build block list (text blocks + images, interleaved by position) ────
    const blocks = [];

    // Compute spacing between consecutive lines
    for (let i = 0; i < sortedLineKeys.length; i++) {
      const lineY = sortedLineKeys[i];
      let spacingBefore = 80; // twips (half-points/20), default small gap
      if (i > 0) {
        const prevY = sortedLineKeys[i - 1];
        const gapPt = prevY - lineY; // positive because descending order
        if (gapPt > 20) {
          // Scale gap: 1pt PDF gap ≈ 15 twips extra spacing
          spacingBefore = Math.min(Math.round(gapPt * 14), 1440);
        }
      }
      blocks.push({ type: 'text', sortY: lineY, spacingBefore, tokens: lineMap.get(lineY) });
    }

    for (const img of extractedImages) {
      blocks.push({ type: 'image', sortY: img.sortY, img, spacingBefore: 200 });
    }

    // Sort: highest Y value in PDF space = top of page = should come first in Word doc
    blocks.sort((a, b) => b.sortY - a.sortY);

    // ── 6. Convert blocks → docx paragraphs ───────────────────────────────────
    for (const block of blocks) {

      // ── Image block ──────────────────────────────────────────────────────────
      if (block.type === 'image') {
        try {
          const { imgU8, dispW, dispH } = block.img;
          const scl  = Math.min(1, MAX_DOC_IMG_W / Math.max(1, dispW));
          const outW = Math.round(dispW * scl);
          const outH = Math.round(dispH * scl);
          allChildren.push(
            new docx.Paragraph({
              alignment: docx.AlignmentType.CENTER,
              spacing  : { before: 200, after: 200, line: 276 },
              children : [
                new docx.ImageRun({
                  data          : imgU8,
                  transformation: { width: outW, height: outH },
                  type          : 'png'
                })
              ]
            })
          );
        } catch (ie) { console.warn('[PDF2WORD] ImageRun error:', ie); }
        continue;
      }

      // ── Text block ───────────────────────────────────────────────────────────
      const tokens = block.tokens;
      // Sort left-to-right (PDF X-axis)
      tokens.sort((a, b) => a.x - b.x);

      // Determine line-level direction
      const fullStr     = tokens.map(t => t.str).join('');
      const lineIsArabic = detectArabic(fullStr);

      /*
       * Build docx.TextRun objects.
       *
       * Strategy for Arabic:
       *   - We do NOT character-reverse. Word and the OS Unicode shaping engine
       *     are responsible for ligature formation once RTL runs are marked.
       *   - We DO put tokens in logical order (left-to-right in the array)
       *     and let Word / the BiDi algorithm handle display order.
       *   - rightToLeft: true on each Arabic TextRun tells Word that this run
       *     carries RTL characters and it should mirror glyph placement.
       */
      const runs = [];

      for (const tok of tokens) {
        // Insert a space between tokens when there is a visible gap
        // (skip for first token, gap is already accounted for in PDF stream order)

        const fontName  = tok.fontName;
        const isBold    = fontName.includes('bold');
        const isItalic  = fontName.includes('italic') || fontName.includes('oblique');

        // Choose base font
        let docxFont = 'Times New Roman';
        if (fontName.includes('arial') || fontName.includes('helvetica')) docxFont = 'Arial';
        else if (fontName.includes('calibri')) docxFont = 'Calibri';
        else if (fontName.includes('courier'))  docxFont = 'Courier New';

        // Split each token into Arabic / non-Arabic segments
        const segments = tokeniseMixed(tok.str);

        for (const seg of segments) {
          if (!seg.text) continue;

          const runFont = seg.isArabic ? 'Arial' : docxFont; // Arabic needs a font with Arabic glyphs

          const runDef = {
            text      : seg.text,
            font      : runFont,
            size      : ptToHalfPt(tok.sizePt),
            color     : tok.colorHex,
            bold      : isBold,
            italics   : isItalic,
            rightToLeft: seg.isArabic
          };

          if (tok.hasUnderline) {
            runDef.underline = { type: docx.UnderlineType.SINGLE, color: tok.colorHex };
          }

          runs.push(new docx.TextRun(runDef));
        }
      }

      if (runs.length === 0) continue;

      allChildren.push(
        new docx.Paragraph({
          bidirectional: lineIsArabic,
          alignment    : lineIsArabic ? docx.AlignmentType.RIGHT : docx.AlignmentType.LEFT,
          spacing      : { before: block.spacingBefore, after: 60, line: 276, lineRule: docx.LineRuleType.AUTO },
          children     : runs
        })
      );
    }

    // Page break between pages (not after the last page)
    if (pageNum < numPages) {
      allChildren.push(
        new docx.Paragraph({
          pageBreakBefore: true,
          children       : [new docx.TextRun('')]
        })
      );
    }
  }

  // ── 7. Assemble the Word document ────────────────────────────────────────────
  prog(93, 'Building .docx file...');

  const doc = new docx.Document({
    sections: [{
      properties: {},
      children  : allChildren.length
        ? allChildren
        : [new docx.Paragraph({ children: [new docx.TextRun('(No content extracted)')] })]
    }]
  });

  return docx.Packer.toBlob(doc);
}`;

code = code.substring(0, startIndex) + newFunc + code.substring(endIndex);
fs.writeFileSync(filePath, code, 'utf8');
console.log('Done. New function length:', newFunc.length, 'bytes');
console.log('File total:', fs.statSync(filePath).size, 'bytes');
