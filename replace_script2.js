const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'main.js');
let code = fs.readFileSync(filePath, 'utf8');

const startStr = "async function convertPDFToWord(arrayBuffer) {";
const endStr = "  return docx.Packer.toBlob(doc);\n}";

const startIndex = code.indexOf(startStr);
if (startIndex === -1) {
    console.error("Start string not found");
    process.exit(1);
}

const endIndex = code.indexOf(endStr, startIndex) + endStr.length;

const newImpl = `async function convertPDFToWord(arrayBuffer) {
  if (typeof pdfjsLib === "undefined") throw new Error("PDF.js library is not loaded.");
  if (typeof docx === "undefined") throw new Error("docx.js library is not loaded.");

  const SCALE = 2.0;
  const ARABIC_RE = /[\\u0600-\\u06FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF]/;
  const LINE_TOL = 5;

  const canvasToUint8 = (c) =>
    new Promise((res, rej) =>
      c.toBlob(
        async (b) => (b ? res(new Uint8Array(await b.arrayBuffer())) : rej(new Error("toBlob failed"))),
        "image/png"
      )
    );

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
    
    // 1. Text Content Extraction and Grouping
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
      lineMap.get(lineKey).push({ item, x: rawX, y: rawY });
    }

    const sortedLineKeys = Array.from(lineMap.keys()).sort((a, b) => b - a);
    const blocks = [];

    for (const lineY of sortedLineKeys) {
      blocks.push({ type: "text", sortY: lineY, items: lineMap.get(lineY) });
    }

    // 3. Safe Embedded Image Extraction
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
      const mulMat = (a, b) => [
        a[0] * b[0] + a[1] * b[2],
        a[0] * b[1] + a[1] * b[3],
        a[2] * b[0] + a[3] * b[2],
        a[2] * b[1] + a[3] * b[3],
        a[4] * b[0] + a[5] * b[2] + b[4],
        a[4] * b[1] + a[5] * b[3] + b[5]
      ];

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
          const corners = [[e, f], [a + e, b + f], [c + e, d + f], [a + c + e, b + d + f]];
          const xs = corners.map(p => p[0]);
          const ys = corners.map(p => p[1]);
          const pdfY = Math.min(...ys);
          const pdfH = Math.max(...ys) - pdfY;
          const pdfW = Math.max(...xs) - Math.min(...xs);

          if (pdfW < 20 || pdfH < 20) continue;

          try {
            let imgObj = null;
            if (typeof imgRef === "object" && imgRef !== null) {
              imgObj = imgRef;
            } else {
              imgObj = await new Promise(resolve => {
                const timer = setTimeout(() => resolve(null), 600);
                const done = (v) => { clearTimeout(timer); resolve(v); };
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
                } catch (_) { done(null); }
              });
            }

            if (imgObj) {
              const tmp = document.createElement("canvas");
              tmp.width = imgObj.width || Math.round(pdfW * SCALE);
              tmp.height = imgObj.height || Math.round(pdfH * SCALE);
              const tCtx = tmp.getContext("2d");

              if (imgObj instanceof ImageBitmap || imgObj instanceof HTMLImageElement || imgObj instanceof HTMLCanvasElement) {
                tCtx.drawImage(imgObj, 0, 0, tmp.width, tmp.height);
              } else if (imgObj.data && imgObj.width && imgObj.height) {
                const id = new ImageData(new Uint8ClampedArray(imgObj.data), imgObj.width, imgObj.height);
                tCtx.putImageData(id, 0, 0);
              }

              const imgU8 = await canvasToUint8(tmp);
              extractedImages.push({ sortY: pdfY + pdfH, imgU8, dispW: Math.round(pdfW), dispH: Math.round(pdfH) });
            }
          } catch (ex) {
            console.warn("[PDF2WORD] image error:", ex);
          }
        }
      }
    } catch (opErr) {
      console.warn("[PDF2WORD] getOperatorList error:", opErr);
    }

    for (const img of extractedImages) {
      blocks.push({ type: "image", sortY: img.sortY, img });
    }
    
    // Sort combined blocks
    blocks.sort((a, b) => b.sortY - a.sortY);

    for (const block of blocks) {
      if (block.type === "image") {
        try {
          const { imgU8, dispW, dispH } = block.img;
          const MAX_IMG_W = 500;
          const scl = Math.min(1, MAX_IMG_W / dispW);
          const outW = Math.round(dispW * scl);
          const outH = Math.round(dispH * scl);

          allChildren.push(
            new docx.Paragraph({
              spacing: { before: 120, after: 120, line: 360 },
              alignment: docx.AlignmentType.CENTER,
              children: [
                new docx.ImageRun({
                  data: imgU8,
                  transformation: { width: outW, height: outH },
                  type: "png"
                })
              ]
            })
          );
        } catch (imgErr) {
          console.warn("[PDF2WORD] ImageRun failed:", imgErr);
        }
        continue;
      }

      // 1. Horizontal Sorting
      const lineItems = block.items;
      lineItems.sort((a, b) => a.x - b.x);

      const fullLineText = lineItems.map(li => li.item.str).join(" ");
      const lineIsArabic = ARABIC_RE.test(fullLineText);

      // 2. Tokenize mixed lines
      let logicalItems = [];
      for (let i = 0; i < lineItems.length; i++) {
        const item = lineItems[i].item;
        let str = item.str;

        if (i > 0) {
          const prevItem = lineItems[i-1];
          const gap = lineItems[i].x - (prevItem.x + (prevItem.item.width || 0));
          if (gap > 5 && !str.startsWith(" ")) {
             str = " " + str;
          }
        }

        const sizePt = Math.round(Math.abs(item.transform[3]) || 12);
        const matches = str.match(/([\\u0600-\\u06FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF]+)|([^\\u0600-\\u06FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF]+)/g);
        
        if (matches) {
          for (let part of matches) {
            logicalItems.push({
              str: part,
              isArabic: ARABIC_RE.test(part),
              sizePt: sizePt
            });
          }
        }
      }

      const runs = [];
      for (const item of logicalItems) {
        if (!item.str) continue;
        
        // As requested: Assign rightToLeft: true and font "Arial" ONLY to Arabic tokens
        const runProps = {
          text: item.str,
          size: Math.max(16, item.sizePt * 2)
        };
        
        if (item.isArabic) {
          runProps.font = "Arial";
          runProps.rightToLeft = true;
        }

        runs.push(new docx.TextRun(runProps));
      }

      if (runs.length === 0) continue;

      // 4. Layout Protection & Spacing
      allChildren.push(
        new docx.Paragraph({
          bidirectional: lineIsArabic,
          alignment: lineIsArabic ? docx.AlignmentType.RIGHT : docx.AlignmentType.LEFT,
          spacing: { before: 120, after: 120, line: 360 },
          children: runs
        })
      );
    }

    if (pageNum < numPages) {
      allChildren.push(
        new docx.Paragraph({
          pageBreakBefore: true,
          children: [new docx.TextRun("")]
        })
      );
    }
  }

  if (typeof setProgress === "function") setProgress("pdf2word", 93, "Building .docx file...");
  
  const doc = new docx.Document({
    sections: [
      {
        properties: {},
        children: allChildren.length ? allChildren : [
          new docx.Paragraph({
            children: [new docx.TextRun("(No content extracted)")]
          })
        ]
      }
    ]
  });
  
  return docx.Packer.toBlob(doc);
}`;

code = code.substring(0, startIndex) + newImpl + code.substring(endIndex);
fs.writeFileSync(filePath, code);
console.log("Success");
