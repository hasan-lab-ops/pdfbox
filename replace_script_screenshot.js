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

  // Use a high scale for sharp, high-quality images in the Word document
  const SCALE = 3.0;

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
  const sections = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    if (typeof setProgress === "function") {
      setProgress("pdf2word", 10 + Math.floor((pageNum / numPages) * 80), "Processing page " + pageNum + " / " + numPages + "...");
    }

    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: SCALE });
    const pageW = viewport.width;
    const pageH = viewport.height;

    // Render the entire page to a canvas (Takes a screenshot)
    const canvas = document.createElement("canvas");
    canvas.width = pageW;
    canvas.height = pageH;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pageW, pageH);
    await page.render({ canvasContext: ctx, viewport }).promise;
    
    // Convert the full page screenshot to a PNG ArrayBuffer
    const imgU8 = await canvasToUint8(canvas);

    // Calculate dimensions for the Word Document
    // Max width of ~600 corresponds nicely to a standard A4 page width with normal margins.
    const MAX_IMG_W = 600;
    const docScale = Math.min(1, MAX_IMG_W / (pageW / (SCALE / 1.5))); // Adjust scaling for Word
    const outW = Math.round((pageW / (SCALE / 1.5)) * docScale);
    const outH = Math.round((pageH / (SCALE / 1.5)) * docScale);

    sections.push({
      properties: {
        page: {
          margin: { top: 720, right: 720, bottom: 720, left: 720 } // 0.5 inch margins (1440 twips = 1 inch)
        }
      },
      children: [
        new docx.Paragraph({
          alignment: docx.AlignmentType.CENTER,
          children: [
            new docx.ImageRun({
              data: imgU8,
              transformation: { width: outW, height: outH },
              type: "png"
            })
          ]
        })
      ]
    });
  }

  if (typeof setProgress === "function") setProgress("pdf2word", 93, "Building .docx file...");
  
  const doc = new docx.Document({
    sections: sections.length ? sections : [{ children: [new docx.Paragraph("No content extracted")] }]
  });
  
  return docx.Packer.toBlob(doc);
}`;

code = code.substring(0, startIndex) + newImpl + code.substring(endIndex);
fs.writeFileSync(filePath, code);
console.log("Success");
