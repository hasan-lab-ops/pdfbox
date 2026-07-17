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

// Find the end index
const endIndex = code.indexOf(endStr, startIndex) + endStr.length;

const newImpl = `async function convertPDFToWord(arrayBuffer) {
  if (typeof pdfjsLib === "undefined")
    throw new Error("PDF.js library is not loaded.");
  if (typeof docx === "undefined")
    throw new Error("docx.js library is not loaded.");
  if (typeof Tesseract === "undefined")
    throw new Error("Tesseract.js library is not loaded.");

  const SCALE = 2.0;
  const MIN_IMG_PX = 20;

  const canvasToUint8 = (c) =>
    new Promise((res, rej) =>
      c.toBlob(
        async (b) =>
          b
            ? res(new Uint8Array(await b.arrayBuffer()))
            : rej(new Error("toBlob failed")),
        "image/png",
      ),
    );

  const mulMat = (a, b) => [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ];

  if (typeof setProgress === "function")
    setProgress("pdf2word", 5, "Initializing OCR engine...");

  const worker = await Tesseract.createWorker("ara+eng");

  if (typeof setProgress === "function")
    setProgress("pdf2word", 10, "Loading PDF...");

  const pdfDoc = await pdfjsLib.getDocument({
    data: arrayBuffer,
    cMapUrl: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/",
    cMapPacked: true,
    standardFontDataUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/standard_fonts/",
  }).promise;

  const numPages = pdfDoc.numPages;
  const allChildren = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    if (typeof setProgress === "function") {
      setProgress(
        "pdf2word",
        10 + Math.floor((pageNum / numPages) * 80),
        "Processing page " + pageNum + " / " + numPages + "...",
      );
    }

    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: SCALE });
    const pageW = viewport.width;
    const pageH = viewport.height;

    const canvas = document.createElement("canvas");
    canvas.width = pageW;
    canvas.height = pageH;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pageW, pageH);

    await page.render({ canvasContext: ctx, viewport }).promise;

    const MAX_IMG_W = Math.round(Math.min(pageW / SCALE, 468) * (96 / 72));

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
                  imgObj.height,
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
              const cy = Math.max(0, pageH - (pdfY + pdfH) * SCALE);
              extractedImages.push({ sortY: cy, imgU8, dispW, dispH });
              
              ctx.fillStyle = "#ffffff";
              const cx = Math.max(0, pdfX * SCALE);
              const cw = Math.max(1, dispW * SCALE);
              const ch = Math.max(1, dispH * SCALE);
              ctx.fillRect(cx - 4, cy - 4, cw + 8, ch + 8);
            }
          } catch (ex) {
            console.warn("[PDF2WORD] image error:", ex);
          }
        }
      }
    } catch (opErr) {
      console.warn("[PDF2WORD] getOperatorList error:", opErr);
    }

    const dataUrl = canvas.toDataURL("image/png");
    const { data: { blocks: ocrBlocks } } = await worker.recognize(dataUrl);

    const layoutBlocks = [];
    
    if (ocrBlocks) {
      for (const block of ocrBlocks) {
        if (!block.paragraphs) continue;
        for (const para of block.paragraphs) {
          layoutBlocks.push({
            type: "text",
            sortY: para.bbox.y0,
            text: para.text
          });
        }
      }
    }

    for (const img of extractedImages) {
      layoutBlocks.push({ type: "image", sortY: img.sortY, img });
    }

    layoutBlocks.sort((a, b) => a.sortY - b.sortY);

    for (const block of layoutBlocks) {
      if (block.type === "image") {
        try {
          const { imgU8, dispW, dispH } = block.img;
          const scl = Math.min(1, MAX_IMG_W / dispW);
          const outW = Math.round(dispW * scl);
          const outH = Math.round(dispH * scl);
          allChildren.push(
            new docx.Paragraph({
              spacing: { before: 120, after: 120, line: 360 },
              children: [
                new docx.ImageRun({
                  data: imgU8,
                  transformation: { width: outW, height: outH },
                  type: "png",
                }),
              ],
            }),
          );
        } catch (imgErr) {
          console.warn("[PDF2WORD] ImageRun failed:", imgErr);
        }
      } else if (block.type === "text") {
        const textStr = block.text.trim();
        if (!textStr) continue;
        
        const lines = textStr.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          const lineText = lines[i].trim();
          if (!lineText) continue;
          
          const isArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFD\uFE70-\uFEFF]/.test(lineText);
          
          allChildren.push(
            new docx.Paragraph({
              bidirectional: isArabic,
              alignment: isArabic ? docx.AlignmentType.RIGHT : docx.AlignmentType.LEFT,
              spacing: { before: 120, after: 120, line: 360 },
              children: [
                new docx.TextRun({
                  text: lineText,
                  font: isArabic ? "Arial" : "Times New Roman",
                  size: 24,
                  rightToLeft: isArabic
                })
              ]
            })
          );
        }
      }
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

  await worker.terminate();

  if (typeof setProgress === "function")
    setProgress("pdf2word", 93, "Building .docx file...");
    
  const doc = new docx.Document({
    sections: [
      {
        properties: {},
        children: allChildren.length
          ? allChildren
          : [
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
