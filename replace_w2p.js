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
   Uses docx-preview to render the Word document visually with exact layout.
   Includes a custom JSZip fallback to manually extract page borders and 
   missing floating images (like header logos) that docx-preview drops.
   ────────────────────────────────────────────────── */ 
async function wordToPDF() {
  const file = state.word2pdf.file;
  if (!file) {
    showToast("Please select a Word document.", "error");
    return;
  }
  if (typeof docxPreview === "undefined") {
    showToast("docx-preview library not loaded. Please check your internet connection.", "error");
    return;
  }
  if (typeof html2canvas === "undefined") {
    showToast("html2canvas library not loaded. Please check your internet connection.", "error");
    return;
  }
  if (typeof JSZip === "undefined") {
    showToast("JSZip library not loaded. Please check your internet connection.", "error");
    return;
  }
  
  showResult("word2pdf", "");
  setProgress("word2pdf", 5, "Reading Word document…");
  setButtonEnabled("btn-word2pdf", false);
  
  try {
    const arrayBuffer = await file.arrayBuffer();
    
    // --- SMART FALLBACK: MANUALLY PARSE DOCX FOR BORDERS AND MISSING IMAGES ---
    setProgress("word2pdf", 10, "Analyzing document structure…");
    const zip = await JSZip.loadAsync(arrayBuffer);
    
    let borderCss = "";
    let extractedImages = [];
    
    // 1. Extract Page Borders
    try {
      const docXmlFile = zip.file("word/document.xml");
      if (docXmlFile) {
        const docXml = await docXmlFile.async("string");
        // Look for page borders: <w:pgBorders> ... </w:pgBorders>
        if (docXml.includes("w:pgBorders")) {
          // Check border style (default to solid, but check for double)
          let borderStyle = "solid";
          if (docXml.includes('w:val="double"')) borderStyle = "double";
          else if (docXml.includes('w:val="dashed"')) borderStyle = "dashed";
          
          // Apply a nice 3px border to the docx pages
          borderCss = \`
            #w2p-render-content .docx { 
              border: 3px \${borderStyle} #000 !important; 
              padding: 40px !important; 
              box-sizing: border-box;
            }
          \`;
        }
      }
    } catch (e) {
      console.warn("Could not parse borders", e);
    }

    // 2. Extract All Images from word/media/
    try {
      const mediaFiles = Object.keys(zip.files).filter(k => k.startsWith("word/media/") && !zip.files[k].dir);
      for (const mediaPath of mediaFiles) {
        const ext = mediaPath.split('.').pop().toLowerCase();
        let mime = "image/png";
        if (ext === "jpg" || ext === "jpeg") mime = "image/jpeg";
        else if (ext === "gif") mime = "image/gif";
        else if (ext === "svg") mime = "image/svg+xml";
        
        const base64 = await zip.file(mediaPath).async("base64");
        extractedImages.push(\`data:\${mime};base64,\${base64}\`);
      }
    } catch (e) {
      console.warn("Could not extract media", e);
    }
    // --------------------------------------------------------------------------

    setProgress("word2pdf", 20, "Rendering document layout…");

    /* Create a windowing container to prevent html2canvas from crashing on large documents */
    const container = document.createElement("div");
    container.id = "w2p-render-window";
    container.style.cssText = [
      "position:fixed",
      "left:-9999px",
      "top:0",
      "width:794px",         // Exact A4 width at 96dpi
      "height:1123px",       // Exact A4 height at 96dpi (1 page)
      "overflow:hidden",     // Hide content outside the current page
      "pointer-events:none",
      "background:#ffffff",
      "z-index:-9999"
    ].join(";");

    const innerContent = document.createElement("div");
    innerContent.id = "w2p-render-content";
    innerContent.style.cssText = [
      "width:794px",
      "background:#ffffff",
      "color:#1a1a1a",
      "box-sizing:border-box"
    ].join(";");

    // Container for docx-preview rendering
    const docxContainer = document.createElement("div");
    innerContent.appendChild(docxContainer);
    
    // We inject custom CSS for full-width images and the extracted border
    const customStyle = document.createElement("style");
    customStyle.innerHTML = \`
      #w2p-render-content .docx-wrapper { padding: 0 !important; background: transparent !important; }
      #w2p-render-content .docx { margin: 0 !important; box-shadow: none !important; min-height: 1123px; }
      \${borderCss}
    \`;
    innerContent.appendChild(customStyle);

    container.appendChild(innerContent);
    document.body.appendChild(container);

    // Use docx-preview to render visually
    await docxPreview.renderAsync(arrayBuffer, docxContainer, null, {
        className: "docx", // default
        inWrapper: true,   // wrap in a .docx-wrapper
        ignoreWidth: false, // preserve original document width
        ignoreHeight: false, // preserve original document height
        ignoreFonts: false,  // preserve fonts
        breakPages: false,   // we slice it manually to avoid complex html2canvas multi-element targeting
        renderHeaders: true,
        renderFooters: true,
        renderFootnotes: true,
        useBase64URL: true,
        experimental: true
    });

    // --- SMART FALLBACK: INJECT MISSING IMAGES ---
    // If the document actually has images, but docx-preview failed to render them (e.g. VML or complex anchoring)
    const renderedImgs = docxContainer.querySelectorAll("img");
    if (extractedImages.length > 0 && renderedImgs.length === 0) {
      // docx-preview completely failed to render the images (likely the floating logos).
      // We will manually inject them into the top of the first page!
      const firstPage = docxContainer.querySelector(".docx");
      if (firstPage) {
        const imageHeader = document.createElement("div");
        imageHeader.style.cssText = "display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; width: 100%;";
        
        extractedImages.forEach(src => {
          const img = document.createElement("img");
          img.src = src;
          // Constrain logos so they don't blow up the page
          img.style.cssText = "max-width: 150px; max-height: 150px; object-fit: contain;";
          imageHeader.appendChild(img);
        });
        
        firstPage.insertBefore(imageHeader, firstPage.firstChild);
      }
    }
    // ------------------------------------------------

    // Wait for all rendered images to load
    const allImgs = innerContent.querySelectorAll("img");
    await Promise.all(
      Array.from(allImgs).map((img) =>
        img.complete ? Promise.resolve() : new Promise((r) => { img.onload = r; img.onerror = r; })
      )
    );

    setProgress("word2pdf", 55, "Measuring document length…");
    const totalHeight = innerContent.scrollHeight;
    const PAGE_H = 1123; // Exact A4 height in px
    const numPdfPages = Math.max(1, Math.ceil(totalHeight / PAGE_H));

    const A4W = 595.28, A4H = 841.89; // Exact A4 points

    setProgress("word2pdf", 60, \`Building PDF (\${numPdfPages} page\${numPdfPages !== 1 ? "s" : ""})…\`);
    
    const pdfDoc = await PDFLib.PDFDocument.create();
    pdfDoc.setTitle(file.name.replace(/\\.(docx?)$/i, ""));
    pdfDoc.setCreator("PDF BOX");
    pdfDoc.setProducer("PDF BOX — pdfbox.app");

    // Process page by page to avoid huge html2canvas memory crashes
    for (let p = 0; p < numPdfPages; p++) {
      setProgress("word2pdf", 60 + Math.round((p / numPdfPages) * 35), \`Rendering page \${p + 1}…\`);
      
      // Shift content up so the window shows the current page
      innerContent.style.marginTop = \`-\${p * PAGE_H}px\`;
      
      // Wait a tiny bit for browser layout to settle
      await new Promise(r => setTimeout(r, 50));

      const pageCanvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        logging: false,
        width: 794,
        height: 1123,
        windowWidth: 794,
        windowHeight: 1123
      });

      const jpegDataUrl = pageCanvas.toDataURL("image/jpeg", 0.94);
      const jpegBlob = dataURLtoBlob(jpegDataUrl);
      const jpegBuf = await jpegBlob.arrayBuffer();
      const embImg = await pdfDoc.embedJpg(new Uint8Array(jpegBuf));
      
      const page = pdfDoc.addPage([A4W, A4H]);
      
      page.drawImage(embImg, {
        x: 0,
        y: 0,
        width: A4W,
        height: A4H,
      });
    }

    document.body.removeChild(container);

    setProgress("word2pdf", 95, "Saving PDF…");
    const out = await pdfDoc.save();
    const blob = new Blob([out], { type: "application/pdf" });
    const name = file.name.replace(/\\.(docx?)$/i, "") + ".pdf";
    setProgress("word2pdf", 100, "Complete!");
    showResult("word2pdf", successResult(name, blob, \`\${numPdfPages} page\${numPdfPages !== 1 ? "s" : ""} · \${formatSize(blob.size)}\`));
    showToast("Word document converted to PDF successfully!");
  } catch (err) {
    const container2 = document.getElementById("w2p-render-window");
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

code = code.substring(0, startIdx) + newImpl + code.substring(endIdx + 24); 
fs.writeFileSync(filePath, code);
console.log("Success");
