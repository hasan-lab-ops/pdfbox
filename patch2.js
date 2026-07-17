const fs = require('fs');

const path = 'c:/Users/capy1/Desktop/New folder/main.js';
let content = fs.readFileSync(path, 'utf8');

const startMarker = 'async function convertPDFToWord(arrayBuffer) {';
const endMarker = '  return docx.Packer.toBlob(doc);\n}';

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker, startIndex);

if (startIndex === -1 || endIndex === -1) {
  console.error("Could not find boundaries!");
  process.exit(1);
}

const replacement = `async function convertPDFToWord(arrayBuffer) {
  if (typeof pdfjsLib === "undefined") throw new Error("PDF.js library is not loaded.");
  if (typeof docx === "undefined") throw new Error("docx.js library is not loaded.");

  const ARABIC_RE = /[\\u0600-\\u06FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF]/;
  const SCALE = 2.0;
  const LINE_TOL = 4;
  const MIN_IMG_PX = 20;

  const fixBullets = (s) =>
    s
      .replace(/\\uF0D8/g, "\\u27A2")
      .replace(/\\uF0B7/g, "\\u2022")
      .replace(/\\uF0A7/g, "\\u25A0")
      .replace(/\\uF0FC/g, "\\u2713")
      .replace(/\\uF0E0/g, "\\u2709")
      .replace(/\\uF020/g, " ");

  const ptToHp = (pt) => Math.max(16, Math.round(Math.abs(pt)) * 2);

  const canvasToUint8 = (c) =>
    new Promise((res, rej) =>
      c.toBlob(
        async (b) => (b ? res(new Uint8Array(await b.arrayBuffer())) : rej(new Error("toBlob failed"))),
        "image/png"
      )
    );

  const mulMat = (a, b) => [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ];

  const sampleHex = (ctx, x, y, w, h) => {
    const sx = Math.max(0, Math.min(Math.floor(x), ctx.canvas.width - 1));
    const sy = Math.max(0, Math.min(Math.floor(y), ctx.canvas.height - 1));
    const sw = Math.max(1, Math.min(Math.ceil(w), ctx.canvas.width - sx));
    const sh = Math.max(1, Math.min(Math.ceil(h), ctx.canvas.height - sy));
    const d = ctx.getImageData(sx, sy, sw, sh).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 50 && (d[i] < 240 || d[i + 1] < 240 || d[i + 2] < 240)) {
        r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
      }
    }
    if (!n) return "000000";
    return [r, g, b].map((v) => Math.round(v / n).toString(16).padStart(2, "0")).join("");
  };

  if (typeof setProgress === "function") setProgress("pdf2word", 10, "Loading PDF...");
  
  const pdfDoc = await pdfjsLib.getDocument({ 
    data: arrayBuffer,
    cMapUrl: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/standard_fonts/"
  }).promise;
  
  const numPages = pdfDoc.numPages;
  const allChildren = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    if (typeof setProgress === "function") {
      setProgress("pdf2word", 10 + Math.floor((pageNum / numPages) * 80), "Processing page " + pageNum + " / " + numPages + "...");
    }

    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: SCALE });
    const pageW = viewport.width;
    const pageH = viewport.height;

    const canvas = document.createElement("canvas");
    canvas.width = pageW;
    canvas.height = pageH;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    await page.render({ canvasContext: ctx, viewport }).promise;

    const MAX_IMG_W = Math.round(Math.min(pageW / SCALE, 468) * (96 / 72));

    // 1. Y-Axis Layout Clustering
    const textContent = await page.getTextContent({ normalizeWhitespace: true });
    const lineMap = new Map();

    for (const item of textContent.items) {
      if (!item.str || !item.str.trim()) continue;
      const rawY = item.transform[5];
      const rawX = item.transform[4];
      let lineKey = null;
      for (const k of lineMap.keys()) {
        if (Math.abs(k - rawY) <= LINE_TOL) {
          lineKey = k;
          break;
        }
      }
      if (lineKey === null) {
        lineKey = rawY;
        lineMap.set(lineKey, []);
      }
      const cX = rawX * SCALE;
      const cY = pageH - rawY * SCALE - item.height * SCALE;
      const cW = (item.width || Math.abs(item.transform[0])) * SCALE;
      const cH = (item.height || Math.abs(item.transform[3])) * SCALE;
      
      lineMap.get(lineKey).push({
        item,
        x: rawX,
        y: rawY,
        colorHex: sampleHex(ctx, cX, cY, cW, cH),
      });
    }

    const sortedLineKeys = Array.from(lineMap.keys()).sort((a, b) => b - a);

    // 3. Robust Image Operator Extraction
    const extractedImages = [];
    try {
      const opList = await page.getOperatorList();
      const OPS = pdfjsLib.OPS;
      const imgOps = new Set([
        OPS.paintImageXObject,
        OPS.paintImageXObjectRepeat,
        OPS.paintInlineImageXObject,
        OPS.paintImageMaskXObject,
      ]);
      const ctmStack = [];
      let ctm = [1, 0, 0, 1, 0, 0];

      for (let i = 0; i < opList.fnArray.length; i++) {
        const fn = opList.fnArray[i];
        const args = opList.argsArray[i];
        if (fn === OPS.save) {
          ctmStack.push([...ctm]);
        } else if (fn === OPS.restore) {
          if (ctmStack.length) ctm = ctmStack.pop();
        } else if (fn === OPS.transform) {
          ctm = mulMat(ctm, args);
        } else if (imgOps.has(fn)) {
          const imgRef = args[0];
          if (!imgRef) continue;
          const [a, b, c, d, e, f] = ctm;
          const corners = [
            [e, f],
            [a + e, b + f],
            [c + e, d + f],
            [a + c + e, b + d + f],
          ];
          const xs = corners.map((p) => p[0]);
          const ys = corners.map((p) => p[1]);
          const pdfX = Math.min(...xs);
          const pdfY = Math.min(...ys);
          const pdfW = Math.max(...xs) - pdfX;
          const pdfH = Math.max(...ys) - pdfY;
          if (pdfW < MIN_IMG_PX || pdfH < MIN_IMG_PX) continue;
          
          try {
            let imgObj = null;
            if (typeof imgRef === "object" && imgRef !== null) {
              imgObj = imgRef;
            } else {
              imgObj = await new Promise((resolve) => {
                const timer = setTimeout(() => resolve(null), 600);
                const done = (v) => {
                  clearTimeout(timer);
                  resolve(v);
                };
                try {
                  if (page.objs.has(imgRef)) {
                    const v = page.objs.get(imgRef, done);
                    if (v !== undefined) done(v);
                  } else if (page.commonObjs && page.commonObjs.has(imgRef)) {
                    const v = page.commonObjs.get(imgRef, done);
                    if (v !== undefined) done(v);
                  } else {
                    done(null);
                  }
                } catch (_) {
                  done(null);
                }
              });
            }
            const dispW = Math.round(pdfW);
            const dispH = Math.round(pdfH);
            let imgU8 = null;
            if (imgObj) {
              const tmp = document.createElement("canvas");
              tmp.width = imgObj.width || dispW * SCALE;
              tmp.height = imgObj.height || dispH * SCALE;
              const tCtx = tmp.getContext("2d");
              if (
                imgObj instanceof ImageBitmap ||
                imgObj instanceof HTMLImageElement ||
                imgObj instanceof HTMLCanvasElement
              ) {
                tCtx.drawImage(imgObj, 0, 0, tmp.width, tmp.height);
              } else if (imgObj.data && imgObj.width && imgObj.height) {
                const id = new ImageData(
                  new Uint8ClampedArray(imgObj.data),
                  imgObj.width,
                  imgObj.height
                );
                tCtx.putImageData(id, 0, 0);
              }
              imgU8 = await canvasToUint8(tmp);
            } else {
              const cx = Math.max(0, pdfX * SCALE);
              const cy = Math.max(0, pageH - (pdfY + pdfH) * SCALE);
              const cw = Math.max(1, dispW * SCALE);
              const ch = Math.max(1, dispH * SCALE);
              if (cx + cw <= pageW && cy + ch <= pageH) {
                const crop = document.createElement("canvas");
                crop.width = cw;
                crop.height = ch;
                const cCtx = crop.getContext("2d");
                cCtx.fillStyle = "#ffffff";
                cCtx.fillRect(0, 0, cw, ch);
                cCtx.drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch);
                imgU8 = await canvasToUint8(crop);
              }
            }
            if (imgU8) {
              extractedImages.push({ sortY: pdfY + pdfH, imgU8, dispW, dispH });
            }
          } catch (ex) {
            console.warn("[PDF2WORD] image error:", ex);
          }
        }
      }
    } catch (opErr) {
      console.warn("[PDF2WORD] getOperatorList error:", opErr);
    }

    const blocks = [];
    for (const lineY of sortedLineKeys) {
      blocks.push({ type: "text", sortY: lineY, items: lineMap.get(lineY) });
    }
    for (const img of extractedImages) {
      blocks.push({ type: "image", sortY: img.sortY, img });
    }
    blocks.sort((a, b) => b.sortY - a.sortY);

    for (const block of blocks) {
      if (block.type === "image") {
        try {
          const { imgU8, dispW, dispH } = block.img;
          const scl = Math.min(1, MAX_IMG_W / dispW);
          const outW = Math.round(dispW * scl);
          const outH = Math.round(dispH * scl);
          allChildren.push(
            new docx.Paragraph({
              // 4. Explicit Document Spacing
              spacing: { before: 120, after: 120, line: 360 },
              children: [
                new docx.ImageRun({
                  data: imgU8,
                  transformation: { width: outW, height: outH },
                  type: "png",
                }),
              ],
            })
          );
        } catch (imgErr) {
          console.warn("[PDF2WORD] ImageRun failed:", imgErr);
        }
        continue;
      }

      // 1. Horizontal Sorting: strict left to right
      const lineItems = block.items;
      lineItems.sort((a, b) => a.x - b.x);

      const fullLineText = lineItems.map((li) => li.item.str).join(" ");
      const lineIsArabic = ARABIC_RE.test(fullLineText);

      const runs = [];
      let lastEdge = null;

      for (const li of lineItems) {
        let raw = fixBullets(li.item.str);
        if (!raw.trim()) continue;

        const sizePt = Math.round(
          Math.abs(li.item.transform[3]) ||
            Math.abs(li.item.transform[0]) ||
            li.item.height ||
            12
        );

        let gap = "";
        if (lastEdge !== null) {
          const gapPts = li.x - lastEdge;
          const spaceW = sizePt * 0.3;
          if (gapPts > spaceW * 0.8) {
            gap = " ".repeat(Math.max(1, Math.round(gapPts / spaceW)));
          }
        }
        lastEdge = li.x + (li.item.width || 0);

        const fn = (li.item.fontName || "").toLowerCase();
        const fontFamily = fn.includes("times")
          ? "Times New Roman"
          : fn.includes("courier")
            ? "Courier New"
            : fn.includes("calibri")
              ? "Calibri"
              : "Arial";

        // Map presentation forms safely to standard Unicode to allow native Word shaping
        if (ARABIC_RE.test(raw)) {
          raw = raw.normalize("NFKD");
        }

        // 2. Native Arabic BiDi Tokenization
        const fullText = gap + raw;
        const tokenRegex = /([\\u0600-\\u06FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF]+)|([^\\u0600-\\u06FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF]+)/g;
        let match;
        
        while ((match = tokenRegex.exec(fullText)) !== null) {
          const tokenText = match[0];
          const isArabicToken = ARABIC_RE.test(tokenText);
          
          runs.push(
            new docx.TextRun({
              text: tokenText,
              font: isArabicToken ? "Arial" : fontFamily,
              size: ptToHp(sizePt),
              color: li.colorHex,
              bold: fn.includes("bold"),
              italics: fn.includes("italic"),
              underline: fn.includes("underline") ? {} : undefined,
              rightToLeft: isArabicToken
            })
          );
        }
      }

      if (runs.length === 0) continue;

      allChildren.push(
        new docx.Paragraph({
          // 2. Native Arabic BiDi Tokenization (Paragraph Config)
          bidirectional: lineIsArabic,
          alignment: lineIsArabic ? docx.AlignmentType.RIGHT : docx.AlignmentType.LEFT,
          // 4. Explicit Document Spacing
          spacing: { before: 120, after: 120, line: 360 },
          children: runs,
        })
      );
    }

    if (pageNum < numPages) {
      allChildren.push(
        new docx.Paragraph({
          pageBreakBefore: true,
          children: [new docx.TextRun("")],
        })
      );
    }
  }

  if (typeof setProgress === "function") setProgress("pdf2word", 93, "Building .docx file...");
  const doc = new docx.Document({
    sections: [
      {
        properties: {},
        children: allChildren.length
          ? allChildren
          : [
              new docx.Paragraph({
                children: [new docx.TextRun("(No content extracted)")],
              }),
            ],
      },
    ],
  });
  return docx.Packer.toBlob(doc);
}`;

const newContent = content.substring(0, startIndex) + replacement + content.substring(endIndex + endMarker.length);
fs.writeFileSync(path, newContent, 'utf8');
console.log("Successfully replaced convertPDFToWord function in main.js");
