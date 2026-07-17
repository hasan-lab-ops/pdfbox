const fs = require('fs');

const filePath = 'c:\\Users\\capy1\\Desktop\\New folder\\main.js';
let code = fs.readFileSync(filePath, 'utf8');

const startStr = "/* ──────────────────────────────────────────────────   12. WORD TO PDF";
const startIdx = code.indexOf(startStr);
const endStr = "function sendContact() {";
const endIdx = code.indexOf(endStr, startIdx);

if (startIdx === -1 || endIdx === -1) {
    console.error("Markers not found");
    process.exit(1);
}

const newImpl = `/* ──────────────────────────────────────────────────   12. WORD TO PDF
   Uses mammoth.js to extract HTML from .docx,
   then html2canvas + pdf-lib to render to PDF.
   Preserves text, images, tables, and formatting.
   ────────────────────────────────────────────────── */ 
async function wordToPDF() {
  const file = state.word2pdf.file;
  if (!file) {
    showToast("Please select a Word document.", "error");
    return;
  }
  if (typeof mammoth === "undefined") {
    showToast("mammoth.js library not loaded. Please check your internet connection.", "error");
    return;
  }
  if (typeof html2canvas === "undefined") {
    showToast("html2canvas library not loaded. Please check your internet connection.", "error");
    return;
  }
  showResult("word2pdf", "");
  setProgress("word2pdf", 5, "Reading Word document…");
  setButtonEnabled("btn-word2pdf", false);
  try {
    const arrayBuffer = await file.arrayBuffer();
    setProgress("word2pdf", 20, "Extracting content…");
    const result = await mammoth.convertToHtml({
      arrayBuffer,
      convertImage: mammoth.images.imgElement((image) => {
        return image.read("base64").then((imageContents) => ({
          src: \`data:\${image.contentType};base64,\${imageContents}\`,
        }));
      }),
    });
    const htmlContent = result.value;
    setProgress("word2pdf", 40, "Rendering document…");

    /* Create an off-screen container styled exactly like an A4 page */
    const container = document.createElement("div");
    container.id = "w2p-render-container";
    container.style.cssText = [
      "position:fixed",
      "left:-9999px",
      "top:0",
      "width:794px",         // Exact A4 width at 96dpi
      "min-height:1123px",   // Exact A4 height at 96dpi
      "padding:0",           // NO container padding, so images can touch edges!
      "background:#ffffff",
      "color:#1a1a1a",
      "font-size:12pt",
      "line-height:1.6",
      "box-sizing:border-box",
      "word-break:break-word",
      "overflow:hidden",
      "unicode-bidi:plaintext",
    ].join(";");

    const ARABIC_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFD\uFE70-\uFEFF]/;

    function applyBidiToFragment(frag) {
      const BLOCKS = ["P", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "TD", "TH", "BLOCKQUOTE", "DIV"];
      frag.querySelectorAll(BLOCKS.join(",")).forEach((el) => {
        const text = el.textContent || "";
        if (ARABIC_REGEX.test(text)) {
          el.setAttribute("dir", "rtl");
          el.setAttribute("lang", "ar");
          el.childNodes.forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
              const bdi = document.createElement("bdi");
              bdi.setAttribute("dir", ARABIC_REGEX.test(node.textContent) ? "rtl" : "ltr");
              bdi.style.fontFamily = ARABIC_REGEX.test(node.textContent)
                ? "'Arial','Segoe UI','Tahoma',sans-serif"
                : "'Times New Roman',Times,serif";
              bdi.textContent = node.textContent;
              node.replaceWith(bdi);
            } else if (node.nodeType === Node.ELEMENT_NODE) {
              const inner = node.textContent || "";
              if (ARABIC_REGEX.test(inner)) {
                node.style.fontFamily = "'Arial','Segoe UI','Tahoma',sans-serif";
                node.setAttribute("dir", "rtl");
              }
            }
          });
        } else {
          if (!el.getAttribute("dir")) {
            el.setAttribute("dir", "ltr");
          }
        }
      });
    }

    const templateFrag = document.createElement("template");
    templateFrag.innerHTML = htmlContent || "<p>(Empty document)</p>";
    applyBidiToFragment(templateFrag.content);

    const rtlAwareHtml = Array.from(templateFrag.content.childNodes)
      .map((n) => {
        if (n.nodeType === Node.ELEMENT_NODE && n.tagName === 'P') {
          const children = Array.from(n.childNodes).filter(c => 
            c.nodeType === Node.ELEMENT_NODE || (c.nodeType === Node.TEXT_NODE && c.textContent.trim().length > 0)
          );
          if (children.length === 1 && children[0].tagName === 'IMG') {
            n.classList.add('full-page-image-p');
          }
        }
        return n.nodeType === Node.ELEMENT_NODE ? n.outerHTML : n.textContent;
      })
      .join("");

    container.innerHTML = \`
      <style>
        #w2p-render-container { font-family: "Times New Roman", Times, serif; unicode-bidi: plaintext; }
        #w2p-render-container h1{font-size:22pt;margin:16px 90px 8px;line-height:1.3;}
        #w2p-render-container h2{font-size:18pt;margin:14px 90px 6px;}
        #w2p-render-container h3{font-size:14pt;margin:12px 90px 4px;}
        #w2p-render-container p{margin:0 90px 8px;unicode-bidi:plaintext;}
        #w2p-render-container table{border-collapse:collapse;width:calc(100% - 180px);margin:0 90px 12px;}
        #w2p-render-container td,#w2p-render-container th{border:1px solid #ccc;padding:6px 8px;unicode-bidi:plaintext;}
        #w2p-render-container img{max-width:100%;height:auto;display:block;margin:0 auto;}
        #w2p-render-container ul,#w2p-render-container ol{margin:0 90px 8px 114px;}
        #w2p-render-container li{margin-bottom:4px;unicode-bidi:plaintext;}
        #w2p-render-container strong{font-weight:bold;}
        #w2p-render-container em{font-style:italic;}
        #w2p-render-container blockquote{border-left:3px solid #ccc;margin:8px 90px;padding-left:16px;color:#555;}
        /* Full page image wrapper (no margins) */
        #w2p-render-container p.full-page-image-p { margin: 0; padding: 0; }
        #w2p-render-container p.full-page-image-p img { width: 100%; height: auto; }
        #w2p-render-container [dir="rtl"]{ text-align:right; font-family:'Arial','Segoe UI','Tahoma',sans-serif; }
        #w2p-render-container bdi{unicode-bidi:isolate;}
      </style>
      \${rtlAwareHtml}
    \`;

    document.body.appendChild(container);

    const imgs = container.querySelectorAll("img");
    await Promise.all(
      Array.from(imgs).map((img) =>
        img.complete ? Promise.resolve() : new Promise((r) => { img.onload = r; img.onerror = r; })
      )
    );

    setProgress("word2pdf", 55, "Rendering to canvas…");
    const fullCanvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      logging: false,
      width: 794,
      windowWidth: 794,
    });
    document.body.removeChild(container);

    const A4W = 595.28, A4H = 841.89; // Exact A4 points
    const imgScale = A4W / (fullCanvas.width / 2);
    const scaledHeight = (fullCanvas.height / 2) * imgScale;
    const numPdfPages = Math.max(1, Math.ceil(scaledHeight / A4H));

    setProgress("word2pdf", 72, \`Building PDF (\${numPdfPages} page\${numPdfPages !== 1 ? "s" : ""})…\`);
    
    const pdfDoc = await PDFLib.PDFDocument.create();
    pdfDoc.setTitle(file.name.replace(/\\.(docx?)$/i, ""));
    pdfDoc.setCreator("PDF BOX");
    pdfDoc.setProducer("PDF BOX — pdfbox.app");

    for (let p = 0; p < numPdfPages; p++) {
      const srcY = p * (A4H / imgScale) * 2;
      const srcH = Math.min((A4H / imgScale) * 2, fullCanvas.height - srcY);
      if (srcH <= 0) break;

      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = fullCanvas.width;
      pageCanvas.height = Math.ceil(srcH);
      const pCtx = pageCanvas.getContext("2d");
      pCtx.fillStyle = "#ffffff";
      pCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      pCtx.drawImage(fullCanvas, 0, -srcY);

      const jpegDataUrl = pageCanvas.toDataURL("image/jpeg", 0.94);
      const jpegBlob = dataURLtoBlob(jpegDataUrl);
      const jpegBuf = await jpegBlob.arrayBuffer();
      const embImg = await pdfDoc.embedJpg(new Uint8Array(jpegBuf));
      
      const page = pdfDoc.addPage([A4W, A4H]);
      const drawH = Math.min(A4H, (srcH / 2) * imgScale);
      
      // Image renders exactly at the A4 dimensions (no padding inside PDFLib drawing layer)
      page.drawImage(embImg, {
        x: 0,
        y: A4H - drawH,
        width: A4W,
        height: drawH,
      });

      setProgress("word2pdf", 72 + Math.round((p / numPdfPages) * 20), \`Rendering page \${p + 1}…\`);
    }

    setProgress("word2pdf", 95, "Saving PDF…");
    const out = await pdfDoc.save();
    const blob = new Blob([out], { type: "application/pdf" });
    const name = file.name.replace(/\\.(docx?)$/i, "") + ".pdf";
    setProgress("word2pdf", 100, "Complete!");
    showResult("word2pdf", successResult(name, blob, \`\${numPdfPages} page\${numPdfPages !== 1 ? "s" : ""} · \${formatSize(blob.size)}\`));
    showToast("Word document converted to PDF successfully!");
  } catch (err) {
    const container2 = document.getElementById("w2p-render-container");
    if (container2) container2.remove();
    setProgress("word2pdf", null);
    showResult("word2pdf", errorResult("Conversion failed: " + err.message));
    showToast("Conversion failed: " + err.message, "error");
  } finally {
    setButtonEnabled("btn-word2pdf", !!state.word2pdf.file);
    setTimeout(() => setProgress("word2pdf", null), 1500);
  }
}
/* ──────────────────────────────────────────────────   CONTACT FORM   ────────────────────────────────────────────────── */
`;

code = code.substring(0, startIdx) + newImpl + code.substring(endIdx + 24); // +24 to offset the matched endStr length
fs.writeFileSync(filePath, code);
console.log("Success");
