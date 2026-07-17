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

  const sampleHex = (ctx, x, y, w, h) => {
    const sx = Math.max(0, Math.min(Math.floor(x), ctx.canvas.width - 1));
    const sy = Math.max(0, Math.min(Math.floor(y), ctx.canvas.height - 1));
    const sw = Math.max(1, Math.min(Math.ceil(w), ctx.canvas.width - sx));
    const sh = Math.max(1, Math.min(Math.ceil(h), ctx.canvas.height - sy));
    let r = 0, g = 0, b = 0, n = 0;
    if (sw > 0 && sh > 0) {
      const d = ctx.getImageData(sx, sy, sw, sh).data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 50 && (d[i] < 240 || d[i + 1] < 240 || d[i + 2] < 240)) {
          r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
        }
      }
    }
    if (!n) return "000000";
    return [r, g, b].map(v => Math.round(v / n).toString(16).padStart(2, "0")).join("");
  };

  const mulMat = (a, b) => [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5]
  ];

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

    // Render to canvas for color sampling
    const canvas = document.createElement("canvas");
    canvas.width = pageW;
    canvas.height = pageH;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pageW, pageH);
    await page.render({ canvasContext: ctx, viewport }).promise;
    
    const textContent = await page.getTextContent({ normalizeWhitespace: true });
    const lineMap = new Map();

    const OPS = pdfjsLib.OPS;
    const extractedImages = [];
    const drawnLines = [];

    // Parse Operator List for images and underlines
    try {
      const opList = await page.getOperatorList();
      const imgOps = new Set([
        OPS.paintImageXObject,
        OPS.paintImageXObjectRepeat,
        OPS.paintInlineImageXObject,
        OPS.paintImageMaskXObject,
      ]);
      const strokeFillOps = new Set([OPS.fill, OPS.stroke, OPS.eoFill]);

      const ctmStack = [];
      let ctm = [1, 0, 0, 1, 0, 0];
      let currentPath = [];

      for (let i = 0; i < opList.fnArray.length; i++) {
        const fn = opList.fnArray[i];
        const args = opList.argsArray[i];

        if (fn === OPS.save) {
          ctmStack.push([...ctm]);
        } else if (fn === OPS.restore) {
          if (ctmStack.length) ctm = ctmStack.pop();
        } else if (fn === OPS.transform) {
          ctm = mulMat(ctm, args);
        } else if (fn === OPS.rectangle) {
          currentPath.push({ type: 'rect', x: args[0], y: args[1], w: args[2], h: args[3] });
        } else if (fn === OPS.moveTo) {
          currentPath.push({ type: 'moveTo', x: args[0], y: args[1] });
        } else if (fn === OPS.lineTo) {
          currentPath.push({ type: 'lineTo', x: args[0], y: args[1] });
        } else if (fn === OPS.beginPath) {
          currentPath = [];
        } else if (strokeFillOps.has(fn)) {
          let lastX = null, lastY = null;
          for (const seg of currentPath) {
            if (seg.type === 'rect') {
              let px0 = seg.x * ctm[0] + seg.y * ctm[2] + ctm[4];
              let py0 = seg.x * ctm[1] + seg.y * ctm[3] + ctm[5];
              let px1 = (seg.x + seg.w) * ctm[0] + (seg.y + seg.h) * ctm[2] + ctm[4];
              let py1 = (seg.x + seg.w) * ctm[1] + (seg.y + seg.h) * ctm[3] + ctm[5];
              let w = Math.max(px0, px1) - Math.min(px0, px1);
              let h = Math.max(py0, py1) - Math.min(py0, py1);
              if (h < 5 && w > 5) {
                drawnLines.push({ x0: Math.min(px0, px1), x1: Math.max(px0, px1), y: Math.max(py0, py1), thickness: h });
              }
            } else if (seg.type === 'moveTo') {
              lastX = seg.x; lastY = seg.y;
            } else if (seg.type === 'lineTo') {
              if (lastX !== null && lastY !== null) {
                let px0 = lastX * ctm[0] + lastY * ctm[2] + ctm[4];
                let py0 = lastX * ctm[1] + lastY * ctm[3] + ctm[5];
                let px1 = seg.x * ctm[0] + seg.y * ctm[2] + ctm[4];
                let py1 = seg.x * ctm[1] + seg.y * ctm[3] + ctm[5];
                if (Math.abs(py0 - py1) < 5 && Math.abs(px0 - px1) > 5) {
                  drawnLines.push({ x0: Math.min(px0, px1), x1: Math.max(px0, px1), y: Math.max(py0, py1), thickness: 1 });
                }
              }
              lastX = seg.x; lastY = seg.y;
            }
          }
          currentPath = [];
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

    // Process Text Items with Color and Underlines
    for (const item of textContent.items) {
      if (!item.str || !item.str.trim()) continue;
      const rawY = item.transform[5];
      const rawX = item.transform[4];
      const cW = (item.width || Math.abs(item.transform[0]));
      
      // Get Color
      const canvasX = rawX * SCALE;
      const canvasY = pageH - rawY * SCALE - (item.height || Math.abs(item.transform[3])) * SCALE;
      const canvasW = cW * SCALE;
      const canvasH = (item.height || Math.abs(item.transform[3])) * SCALE;
      const colorHex = sampleHex(ctx, canvasX, canvasY, canvasW, canvasH);

      // Get Underline
      let hasUnderline = false;
      for (const dl of drawnLines) {
        if (dl.y < rawY + 2 && dl.y > rawY - 8) {
           if (dl.x1 >= rawX && dl.x0 <= rawX + cW) {
              hasUnderline = true;
              break;
           }
        }
      }
      
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
      lineMap.get(lineKey).push({ item, x: rawX, y: rawY, colorHex, hasUnderline });
    }

    const sortedLineKeys = Array.from(lineMap.keys()).sort((a, b) => b - a);
    const blocks = [];

    for (let i = 0; i < sortedLineKeys.length; i++) {
      const lineY = sortedLineKeys[i];
      let spacingBefore = 120;
      if (i > 0) {
         const prevY = sortedLineKeys[i-1];
         const diff = prevY - lineY;
         if (diff > 25) {
            spacingBefore = Math.min(Math.round(diff * 15), 1000); 
         }
      }
      blocks.push({ type: "text", sortY: lineY, spacingBefore, items: lineMap.get(lineY) });
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
              spacing: { before: 240, after: 240, line: 360 },
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

      // Process Text Block
      const lineItems = block.items;
      lineItems.sort((a, b) => a.x - b.x);

      const fullLineText = lineItems.map(li => li.item.str).join(" ");
      const lineIsArabic = ARABIC_RE.test(fullLineText);

      // Tokenize mixed lines and capture colors/underlines
      let logicalItems = [];
      for (let i = 0; i < lineItems.length; i++) {
        const lineItem = lineItems[i];
        const item = lineItem.item;
        let str = item.str;

        if (i > 0) {
          const prevItem = lineItems[i-1];
          const gap = lineItem.x - (prevItem.x + (prevItem.item.width || 0));
          if (gap > 5 && !str.startsWith(" ")) {
             str = " " + str;
          }
        }

        const sizePt = Math.round(Math.abs(item.transform[3]) || 12);
        
        // Tokenize by Arabic / Non-Arabic
        const matches = str.match(/([\\u0600-\\u06FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF]+)|([^\\u0600-\\u06FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF]+)/g);
        
        if (matches) {
          for (let part of matches) {
            const isArabicPart = ARABIC_RE.test(part);
            let finalStr = part;
            
            if (isArabicPart) {
               // Fully correct Arabic visual reversal as requested for broken PDFs
               finalStr = finalStr.split('').reverse().join('');
            }
            
            logicalItems.push({
              str: finalStr,
              isArabic: isArabicPart,
              sizePt: sizePt,
              colorHex: lineItem.colorHex,
              hasUnderline: lineItem.hasUnderline
            });
          }
        }
      }

      if (lineIsArabic) {
        logicalItems.reverse(); // Ensure physical ordering matches RTL progression
      }

      const runs = [];
      for (const item of logicalItems) {
        if (!item.str) continue;
        
        const runProps = {
          text: item.str,
          size: Math.max(16, item.sizePt * 2), // font size as in original file
          color: item.colorHex
        };
        
        if (item.hasUnderline) {
          runProps.underline = {
            type: docx.UnderlineType.SINGLE,
            color: item.colorHex
          };
        }
        
        if (item.isArabic) {
          runProps.font = "Arial";
          runProps.rightToLeft = true;
        }

        runs.push(new docx.TextRun(runProps));
      }

      if (runs.length === 0) continue;

      allChildren.push(
        new docx.Paragraph({
          bidirectional: lineIsArabic,
          alignment: lineIsArabic ? docx.AlignmentType.RIGHT : docx.AlignmentType.LEFT,
          spacing: { before: block.spacingBefore, after: 60, line: 360 }, // Dynamic spacing
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
