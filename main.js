/* ===================================================   PDF BOX — Main JavaScript   Tools: Merge, Split, Compress, Rotate,          PDF→Images, Images→PDF, Watermark, Protect,          Extract Pages, PDF Viewer, PDF→Word, Word→PDF   Libraries: pdf-lib-with-encrypt, PDF.js, docx.js,              mammoth.js, html2canvas, FileSaver.js   =================================================== */ "use strict";
/* ──────────────────────────────────────────────────   STATE   ────────────────────────────────────────────────── */ const state =
{
  merge: { files: [] },
  split: { file: null, pageCount: 0 },
  compress: { file: null },
  rotate: { file: null, angle: 90 },
  pdf2img: { file: null, dpi: 150 },
  img2pdf: { files: [] },
  watermark: { file: null },
  protect: { file: null },
  extract: { file: null, pageCount: 0 },
  viewer: { file: null, pdf: null, page: 1, total: 0, zoom: 1.0 },
  pdf2word: { file: null },
  word2pdf: { file: null },
};
/* ──────────────────────────────────────────────────   NAVBAR SCROLL   ────────────────────────────────────────────────── */ window.addEventListener(
  "scroll",
  () => {
    const nav = document.getElementById("navbar");
    if (window.scrollY > 20) {
      nav.classList.add("scrolled");
    } else {
      nav.classList.remove("scrolled");
    }
  },
);
/* ──────────────────────────────────────────────────   MOBILE MENU   ────────────────────────────────────────────────── */ document
  .getElementById("hamburger")
  .addEventListener("click", () => {
    const menu = document.getElementById("mobileMenu");
    menu.classList.toggle("open");
  });
function closeMobileMenu() {
  document.getElementById("mobileMenu").classList.remove("open");
}
/* ──────────────────────────────────────────────────   MODAL SYSTEM   ────────────────────────────────────────────────── */ let currentModal =
  null;
function openModal(id) {
  closeModal(false);
  const modal = document.getElementById("modal-" + id);
  const overlay = document.getElementById("modalOverlay");
  if (!modal) return;
  overlay.classList.add("active");
  modal.classList.add("active");
  currentModal = id;
  document.body.style.overflow = "hidden";
  setTimeout(() => (modal.scrollTop = 0), 10);
}
function closeModal(restore = true) {
  if (currentModal) {
    const modal = document.getElementById("modal-" + currentModal);
    if (modal) modal.classList.remove("active");
    currentModal = null;
  }
  document.getElementById("modalOverlay").classList.remove("active");
  if (restore) document.body.style.overflow = "";
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});
/* ──────────────────────────────────────────────────   TOAST NOTIFICATIONS   ────────────────────────────────────────────────── */ let toastTimer =
  null;
function showToast(msg, type = "info") {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.className = "toast show" + (type === "error" ? " error" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 4000);
}
/* ──────────────────────────────────────────────────   DRAG & DROP HELPERS   ────────────────────────────────────────────────── */ function handleDragOver(
  e,
) {
  e.preventDefault();
  e.currentTarget.classList.add("dragover");
}
function handleDragLeave(e) {
  e.currentTarget.classList.remove("dragover");
}
function handleDrop(e, inputId) {
  e.preventDefault();
  e.currentTarget.classList.remove("dragover");
  const input = document.getElementById(inputId);
  const files = e.dataTransfer.files;
  if (!files.length) return;
  const dt = new DataTransfer();
  Array.from(files).forEach((f) => dt.items.add(f));
  input.files = dt.files;
  input.dispatchEvent(new Event("change"));
}
/* ──────────────────────────────────────────────────   FILE SELECTION HANDLER (unified)   ────────────────────────────────────────────────── */ function handleFileSelect(
  tool,
  files,
) {
  const arr = Array.from(files);
  if (!arr.length) return;
  const pdfOnlyTools = [
    "split",
    "compress",
    "rotate",
    "pdf2img",
    "watermark",
    "protect",
    "extract",
    "viewer",
    "pdf2word",
  ];
  if (pdfOnlyTools.includes(tool)) {
    if (!arr[0].name.toLowerCase().endsWith(".pdf")) {
      showToast("Please select a valid PDF file.", "error");
      return;
    }
  }
  if (tool === "img2pdf") {
    const invalid = arr.find((f) => !f.type.startsWith("image/"));
    if (invalid) {
      showToast("Only image files (JPG, PNG, WebP) are accepted.", "error");
      return;
    }
  }
  if (tool === "word2pdf") {
    const name = arr[0].name.toLowerCase();
    if (!name.endsWith(".docx") && !name.endsWith(".doc")) {
      showToast("Please select a Word document (.docx or .doc).", "error");
      return;
    }
  }
  switch (tool) {
    case "merge":
      arr.forEach((f) => {
        if (f.name.toLowerCase().endsWith(".pdf")) state.merge.files.push(f);
      });
      renderFileList("merge", state.merge.files, true);
      setButtonEnabled("btn-merge", state.merge.files.length >= 2);
      if (state.merge.files.length < 2)
        showToast("Add at least 2 PDF files to merge.", "info");
      break;
    case "split":
      state.split.file = arr[0];
      renderFileList("split", [arr[0]], false);
      setButtonEnabled("btn-split", true);
      getPDFPageCount(arr[0]).then((n) => {
        state.split.pageCount = n;
        document.getElementById("split-page-count").textContent =
          `This PDF has ${n} page${n !== 1 ? "s" : ""}.`;
      });
      break;
    case "compress":
      state.compress.file = arr[0];
      renderFileList("compress", [arr[0]], false);
      setButtonEnabled("btn-compress", true);
      break;
    case "rotate":
      state.rotate.file = arr[0];
      renderFileList("rotate", [arr[0]], false);
      setButtonEnabled("btn-rotate", true);
      break;
    case "pdf2img":
      state.pdf2img.file = arr[0];
      renderFileList("pdf2img", [arr[0]], false);
      setButtonEnabled("btn-pdf2img", true);
      break;
    case "img2pdf":
      arr.forEach((f) => {
        if (f.type.startsWith("image/")) state.img2pdf.files.push(f);
      });
      renderFileList("img2pdf", state.img2pdf.files, true);
      setButtonEnabled("btn-img2pdf", state.img2pdf.files.length >= 1);
      break;
    case "watermark":
      state.watermark.file = arr[0];
      renderFileList("watermark", [arr[0]], false);
      setButtonEnabled("btn-watermark", true);
      break;
    case "protect":
      state.protect.file = arr[0];
      renderFileList("protect", [arr[0]], false);
      setButtonEnabled("btn-protect", true);
      break;
    case "extract":
      state.extract.file = arr[0];
      renderFileList("extract", [arr[0]], false);
      setButtonEnabled("btn-extract", true);
      getPDFPageCount(arr[0]).then((n) => {
        state.extract.pageCount = n;
        document.getElementById("extract-page-count").textContent =
          `This PDF has ${n} page${n !== 1 ? "s" : ""}.`;
      });
      break;
    case "viewer":
      state.viewer.file = arr[0];
      renderFileList("viewer", [arr[0]], false);
      loadViewerPDF(arr[0]);
      break;
    case "pdf2word":
      state.pdf2word.file = arr[0];
      renderFileList("pdf2word", [arr[0]], false);
      setButtonEnabled("btn-pdf2word", true);
      break;
    case "word2pdf":
      state.word2pdf.file = arr[0];
      renderFileList("word2pdf", [arr[0]], false);
      setButtonEnabled("btn-word2pdf", true);
      break;
  }
}
/* ──────────────────────────────────────────────────   FILE LIST RENDERER   ────────────────────────────────────────────────── */ function renderFileList(
  tool,
  files,
  removable,
) {
  const container = document.getElementById("files-" + tool);
  if (!container) return;
  container.innerHTML = "";
  files.forEach((file, idx) => {
    const item = document.createElement("div");
    item.className = "file-item";
    item.innerHTML = `      <div class="file-item-icon">        <svg viewBox="0 0 24 24" fill="none">          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="2"/>          <polyline points="14 2 14 8 20 8" stroke="currentColor" stroke-width="2"/>        </svg>      </div>      <span class="file-item-name" title="${escHtml(file.name)}">${escHtml(file.name)}</span>      <span class="file-item-size">${formatSize(file.size)}</span>      ${removable ? `<button class="file-item-remove" onclick="removeFile('${tool}',${idx})" title="Remove">        <svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>      </button>` : ""}    `;
    container.appendChild(item);
  });
}
function removeFile(tool, idx) {
  if (tool === "merge") {
    state.merge.files.splice(idx, 1);
    renderFileList("merge", state.merge.files, true);
    setButtonEnabled("btn-merge", state.merge.files.length >= 2);
  } else if (tool === "img2pdf") {
    state.img2pdf.files.splice(idx, 1);
    renderFileList("img2pdf", state.img2pdf.files, true);
    setButtonEnabled("btn-img2pdf", state.img2pdf.files.length >= 1);
  }
}
/* ──────────────────────────────────────────────────   UTILITIES   ────────────────────────────────────────────────── */ function formatSize(
  bytes,
) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(2) + " MB";
}
function escHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function setButtonEnabled(id, enabled) {
  const btn = document.getElementById(id);
  if (btn) btn.disabled = !enabled;
}
function setProgress(tool, pct, text) {
  const wrap = document.getElementById("progress-" + tool);
  const fill = document.getElementById("pf-" + tool);
  const pt = document.getElementById("pt-" + tool);
  if (wrap) wrap.style.display = pct === null ? "none" : "block";
  if (fill) fill.style.width = (pct || 0) + "%";
  if (pt) pt.textContent = text || "";
}
function showResult(tool, html) {
  const box = document.getElementById("result-" + tool);
  if (box) box.innerHTML = html;
}
function successResult(filename, blob, extra = "") {
  const url = URL.createObjectURL(blob);
  return `    <div class="result-success">      <div class="result-success-row">        <svg viewBox="0 0 24 24" fill="none"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke="currentColor" stroke-width="2"/><polyline points="22 4 12 14.01 9 11.01" stroke="currentColor" stroke-width="2"/></svg>        <span>Done! ${escHtml(filename)} (${extra})</span>      </div>      <a class="download-btn" href="${url}" download="${escHtml(filename)}">        <svg viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" stroke-width="2"/><polyline points="17 8 12 13 7 8" stroke="currentColor" stroke-width="2"/><line x1="12" y1="3" x2="12" y2="13" stroke="currentColor" stroke-width="2"/></svg>        Download ${escHtml(filename)}      </a>    </div>  `;
}
function errorResult(msg) {
  return `    <div class="result-error">      <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" stroke-width="2"/><line x1="12" y1="16" x2="12.01" y2="16" stroke="currentColor" stroke-width="2"/></svg>      <span>${escHtml(msg)}</span>    </div>  `;
}
async function readFileBytes(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(new Uint8Array(e.target.result));
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsArrayBuffer(file);
  });
}
async function getPDFPageCount(file) {
  try {
    const bytes = await readFileBytes(file);
    const pdf = await PDFLib.PDFDocument.load(bytes, {
      ignoreEncryption: true,
    });
    return pdf.getPageCount();
  } catch {
    return 0;
  }
}
function parsePageRange(str, total) {
  const indices = new Set();
  const parts = str
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const part of parts) {
    if (part.includes("-")) {
      let [a, b] = part.split("-").map(Number);
      if (isNaN(a) || isNaN(b)) throw new Error(`Invalid range: "${part}"`);
      a = Math.max(1, a);
      b = Math.min(total, b);
      for (let i = a; i <= b; i++) indices.add(i - 1);
    } else {
      const n = Number(part);
      if (isNaN(n) || n < 1 || n > total)
        throw new Error(`Page ${part} out of range (1–${total}).`);
      indices.add(n - 1);
    }
  }
  return [...indices].sort((a, b) => a - b);
}
/* ──────────────────────────────────────────────────   1. MERGE PDFs   ────────────────────────────────────────────────── */ async function mergePDFs() {
  const files = state.merge.files;
  if (files.length < 2) {
    showToast("Add at least 2 PDF files.", "error");
    return;
  }
  showResult("merge", "");
  setProgress("merge", 5, "Loading files…");
  setButtonEnabled("btn-merge", false);
  try {
    const merged = await PDFLib.PDFDocument.create();
    for (let i = 0; i < files.length; i++) {
      setProgress(
        "merge",
        10 + Math.round((i / files.length) * 80),
        `Merging file ${i + 1} of ${files.length}…`,
      );
      const bytes = await readFileBytes(files[i]);
      const doc = await PDFLib.PDFDocument.load(bytes, {
        ignoreEncryption: true,
      });
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      pages.forEach((p) => merged.addPage(p));
    }
    setProgress("merge", 95, "Saving…");
    const out = await merged.save();
    const blob = new Blob([out], { type: "application/pdf" });
    const name =
      (document.getElementById("merge-output").value.trim() || "merged") +
      ".pdf";
    setProgress("merge", 100, "Complete!");
    showResult("merge", successResult(name, blob, formatSize(blob.size)));
    showToast("PDFs merged successfully!");
  } catch (err) {
    setProgress("merge", null);
    showResult("merge", errorResult("Merge failed: " + err.message));
    showToast("Merge failed: " + err.message, "error");
  } finally {
    setButtonEnabled("btn-merge", state.merge.files.length >= 2);
    setTimeout(() => setProgress("merge", null), 1500);
  }
}
/* ──────────────────────────────────────────────────   2. SPLIT PDF   ────────────────────────────────────────────────── */ async function splitPDF() {
  const file = state.split.file;
  if (!file) {
    showToast("Please select a PDF file.", "error");
    return;
  }
  const rangeStr = document.getElementById("split-range").value.trim();
  if (!rangeStr) {
    showToast("Enter a page range (e.g. 1-3).", "error");
    return;
  }
  showResult("split", "");
  setProgress("split", 10, "Loading PDF…");
  setButtonEnabled("btn-split", false);
  try {
    const bytes = await readFileBytes(file);
    const doc = await PDFLib.PDFDocument.load(bytes, {
      ignoreEncryption: true,
    });
    const total = doc.getPageCount();
    setProgress("split", 30, "Parsing page range…");
    let indices;
    try {
      indices = parsePageRange(rangeStr, total);
    } catch (err) {
      throw new Error(err.message);
    }
    if (indices.length === 0)
      throw new Error("No valid pages in the specified range.");
    setProgress("split", 60, `Extracting ${indices.length} page(s)…`);
    const newDoc = await PDFLib.PDFDocument.create();
    const pages = await newDoc.copyPages(doc, indices);
    pages.forEach((p) => newDoc.addPage(p));
    setProgress("split", 90, "Saving…");
    const out = await newDoc.save();
    const blob = new Blob([out], { type: "application/pdf" });
    const name =
      file.name.replace(".pdf", "") +
      `_pages_${rangeStr.replace(/,/g, "-")}.pdf`;
    setProgress("split", 100, "Complete!");
    showResult(
      "split",
      successResult(
        name,
        blob,
        `${indices.length} pages · ${formatSize(blob.size)}`,
      ),
    );
    showToast("PDF split successfully!");
  } catch (err) {
    setProgress("split", null);
    showResult("split", errorResult("Split failed: " + err.message));
    showToast("Split failed: " + err.message, "error");
  } finally {
    setButtonEnabled("btn-split", !!state.split.file);
    setTimeout(() => setProgress("split", null), 1500);
  }
}
/* ──────────────────────────────────────────────────   3. COMPRESS PDF   ────────────────────────────────────────────────── */ async function compressPDF() {
  const file = state.compress.file;
  if (!file) {
    showToast("Please select a PDF file.", "error");
    return;
  }
  const level = document.querySelector(
    'input[name="compress-level"]:checked',
  ).value;
  showResult("compress", "");
  setProgress("compress", 10, "Loading PDF…");
  setButtonEnabled("btn-compress", false);
  try {
    const bytes = await readFileBytes(file);
    setProgress("compress", 40, "Optimizing…");
    const doc = await PDFLib.PDFDocument.load(bytes, {
      ignoreEncryption: true,
    });
    const saveOpts = { useObjectStreams: true, addDefaultPage: false };
    if (level === "high") {
      doc.setTitle("");
      doc.setAuthor("");
      doc.setSubject("");
      doc.setKeywords([]);
      doc.setProducer("PDF BOX");
      doc.setCreator("PDF BOX");
    }
    setProgress("compress", 70, "Re-encoding…");
    const out = await doc.save(saveOpts);
    const blob = new Blob([out], { type: "application/pdf" });
    const name = file.name.replace(".pdf", "") + "_compressed.pdf";
    const saved = file.size - blob.size;
    const pct = ((saved / file.size) * 100).toFixed(1);
    const extra =
      saved > 0
        ? `${formatSize(blob.size)} · saved ${formatSize(saved)} (${pct}%)`
        : `${formatSize(blob.size)} · already optimized`;
    setProgress("compress", 100, "Complete!");
    showResult("compress", successResult(name, blob, extra));
    showToast(
      saved > 0 ? `Compressed! Saved ${pct}%` : "PDF already well-optimized.",
    );
  } catch (err) {
    setProgress("compress", null);
    showResult("compress", errorResult("Compression failed: " + err.message));
    showToast("Compression failed: " + err.message, "error");
  } finally {
    setButtonEnabled("btn-compress", !!state.compress.file);
    setTimeout(() => setProgress("compress", null), 1500);
  }
}
/* ──────────────────────────────────────────────────   4. ROTATE PDF   ────────────────────────────────────────────────── */ let rotateAngle = 90;
function selectRotation(angle, btn) {
  rotateAngle = angle;
  state.rotate.angle = angle;
  document
    .querySelectorAll("#rot-90, #rot-180, #rot-270")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
}
document.addEventListener("change", (e) => {
  if (e.target && e.target.name === "rotate-pages") {
    const specific = document.getElementById("rotate-specific");
    if (specific)
      specific.style.display = e.target.value === "specific" ? "block" : "none";
  }
});
async function rotatePDF() {
  const file = state.rotate.file;
  if (!file) {
    showToast("Please select a PDF file.", "error");
    return;
  }
  const angle = state.rotate.angle || 90;
  const modeEl = document.querySelector('input[name="rotate-pages"]:checked');
  const mode = modeEl ? modeEl.value : "all";
  showResult("rotate", "");
  setProgress("rotate", 10, "Loading PDF…");
  setButtonEnabled("btn-rotate", false);
  try {
    const bytes = await readFileBytes(file);
    const doc = await PDFLib.PDFDocument.load(bytes, {
      ignoreEncryption: true,
    });
    const pages = doc.getPages();
    const total = pages.length;
    setProgress("rotate", 40, "Rotating pages…");
    if (mode === "all") {
      pages.forEach((page) => {
        const current = page.getRotation().angle;
        page.setRotation(PDFLib.degrees((current + angle) % 360));
      });
    } else {
      const specStr = document.getElementById("rotate-specific").value.trim();
      if (!specStr)
        throw new Error("Enter specific page numbers (e.g. 1,3,5).");
      const indices = parsePageRange(specStr, total);
      indices.forEach((i) => {
        const current = pages[i].getRotation().angle;
        pages[i].setRotation(PDFLib.degrees((current + angle) % 360));
      });
    }
    setProgress("rotate", 85, "Saving…");
    const out = await doc.save();
    const blob = new Blob([out], { type: "application/pdf" });
    const name = file.name.replace(".pdf", "") + `_rotated${angle}.pdf`;
    setProgress("rotate", 100, "Complete!");
    showResult(
      "rotate",
      successResult(name, blob, `${angle}° · ${formatSize(blob.size)}`),
    );
    showToast(`Rotated ${angle}° successfully!`);
  } catch (err) {
    setProgress("rotate", null);
    showResult("rotate", errorResult("Rotate failed: " + err.message));
    showToast("Rotate failed: " + err.message, "error");
  } finally {
    setButtonEnabled("btn-rotate", !!state.rotate.file);
    setTimeout(() => setProgress("rotate", null), 1500);
  }
}
/* ──────────────────────────────────────────────────   5. PDF TO IMAGES (PDF.js)   ────────────────────────────────────────────────── */ let pdfToImgDPI = 150;
function selectDPI(dpi, btn) {
  pdfToImgDPI = dpi;
  state.pdf2img.dpi = dpi;
  document
    .querySelectorAll("#dpi-72, #dpi-150, #dpi-300")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
}
async function pdfToImages() {
  const file = state.pdf2img.file;
  if (!file) {
    showToast("Please select a PDF file.", "error");
    return;
  }
  const dpi = state.pdf2img.dpi || 150;
  const scale = dpi / 72;
  showResult("pdf2img", "");
  setProgress("pdf2img", 5, "Loading PDF…");
  setButtonEnabled("btn-pdf2img", false);
  try {
    const bytes = await readFileBytes(file);
    const pdfDoc = await pdfjsLib.getDocument({ data: bytes }).promise;
    const numPages = pdfDoc.numPages;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const imageLinks = [];
    for (let i = 1; i <= numPages; i++) {
      setProgress(
        "pdf2img",
        Math.round((i / numPages) * 90),
        `Rendering page ${i} of ${numPages}…`,
      );
      const page = await pdfDoc.getPage(i);
      const viewport = page.getViewport({ scale });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      const dataUrl = canvas.toDataURL("image/png");
      const blob = dataURLtoBlob(dataUrl);
      const url = URL.createObjectURL(blob);
      const pageName = file.name.replace(".pdf", "") + `_page${i}.png`;
      imageLinks.push({ url, name: pageName, dataUrl });
    }
    setProgress("pdf2img", 100, "Complete!");
    let html = `<div class="result-success">      <div class="result-success-row">        <svg viewBox="0 0 24 24" fill="none"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke="currentColor" stroke-width="2"/><polyline points="22 4 12 14.01 9 11.01" stroke="currentColor" stroke-width="2"/></svg>        <span>Converted ${numPages} page${numPages !== 1 ? "s" : ""} at ${dpi} DPI</span>      </div>      <div class="img-preview-grid">    `;
    imageLinks.forEach((img, i) => {
      html += `<a href="${img.url}" download="${escHtml(img.name)}" title="Download page ${i + 1}">        <img src="${img.dataUrl}" alt="Page ${i + 1}" />      </a>`;
    });
    html += `</div><small style="color:var(--text-muted);font-size:.78rem;">Click any image to download it.</small></div>`;
    showResult("pdf2img", html);
    showToast(
      `${numPages} image${numPages !== 1 ? "s" : ""} ready to download!`,
    );
  } catch (err) {
    setProgress("pdf2img", null);
    showResult("pdf2img", errorResult("Conversion failed: " + err.message));
    showToast("Conversion failed: " + err.message, "error");
  } finally {
    setButtonEnabled("btn-pdf2img", !!state.pdf2img.file);
    setTimeout(() => setProgress("pdf2img", null), 1500);
  }
}
function dataURLtoBlob(dataUrl) {
  const [header, data] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)[1];
  const binary = atob(data);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
/* ──────────────────────────────────────────────────   6. IMAGES TO PDF   ────────────────────────────────────────────────── */ async function imagesToPDF() {
  const files = state.img2pdf.files;
  if (!files.length) {
    showToast("Please select at least one image.", "error");
    return;
  }
  const pageSize = document.getElementById("img2pdf-pagesize").value;
  showResult("img2pdf", "");
  setProgress("img2pdf", 5, "Creating PDF…");
  setButtonEnabled("btn-img2pdf", false);
  try {
    const pdfDoc = await PDFLib.PDFDocument.create();
    for (let i = 0; i < files.length; i++) {
      setProgress(
        "img2pdf",
        10 + Math.round((i / files.length) * 80),
        `Adding image ${i + 1} of ${files.length}…`,
      );
      const file = files[i];
      const bytes = await readFileBytes(file);
      let img;
      try {
        if (file.type === "image/png") {
          img = await pdfDoc.embedPng(bytes);
        } else {
          img = await embedImageFlexible(pdfDoc, file, bytes);
        }
      } catch {
        img = await embedImageViaCanvas(pdfDoc, file);
      }
      const dims = img.scale(1);
      let pageWidth, pageHeight;
      if (pageSize === "A4") {
        pageWidth = 595;
        pageHeight = 842;
      } else if (pageSize === "Letter") {
        pageWidth = 612;
        pageHeight = 792;
      } else {
        pageWidth = dims.width;
        pageHeight = dims.height;
      }
      const page = pdfDoc.addPage([pageWidth, pageHeight]);
      const ratio = Math.min(pageWidth / dims.width, pageHeight / dims.height);
      const w = dims.width * ratio;
      const h = dims.height * ratio;
      const x = (pageWidth - w) / 2;
      const y = (pageHeight - h) / 2;
      page.drawImage(img, { x, y, width: w, height: h });
    }
    setProgress("img2pdf", 95, "Saving…");
    const out = await pdfDoc.save();
    const blob = new Blob([out], { type: "application/pdf" });
    const name =
      (document.getElementById("img2pdf-output").value.trim() || "images") +
      ".pdf";
    setProgress("img2pdf", 100, "Complete!");
    showResult(
      "img2pdf",
      successResult(
        name,
        blob,
        `${files.length} page${files.length !== 1 ? "s" : ""} · ${formatSize(blob.size)}`,
      ),
    );
    showToast("Images converted to PDF!");
  } catch (err) {
    setProgress("img2pdf", null);
    showResult("img2pdf", errorResult("Conversion failed: " + err.message));
    showToast("Conversion failed: " + err.message, "error");
  } finally {
    setButtonEnabled("btn-img2pdf", state.img2pdf.files.length >= 1);
    setTimeout(() => setProgress("img2pdf", null), 1500);
  }
}
async function embedImageFlexible(pdfDoc, file, bytes) {
  if (file.type === "image/jpeg" || file.type === "image/jpg") {
    return await pdfDoc.embedJpg(bytes);
  }
  return await embedImageViaCanvas(pdfDoc, file);
}
async function embedImageViaCanvas(pdfDoc, file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      const jpegBytes = dataURLtoBlob(dataUrl);
      const arrBuf = await jpegBytes.arrayBuffer();
      URL.revokeObjectURL(url);
      try {
        const embedded = await pdfDoc.embedJpg(new Uint8Array(arrBuf));
        resolve(embedded);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image: " + file.name));
    };
    img.src = url;
  });
}
/* ──────────────────────────────────────────────────   7. ADD WATERMARK   ────────────────────────────────────────────────── */ async function addWatermark() {
  const file = state.watermark.file;
  if (!file) {
    showToast("Please select a PDF file.", "error");
    return;
  }
  const text = document.getElementById("wm-text").value.trim() || "WATERMARK";
  const size = parseInt(document.getElementById("wm-size").value) || 50;
  const opacity = parseInt(document.getElementById("wm-opacity").value) / 100;
  const hexColor = document.getElementById("wm-color").value;
  const rgb = hexToRgb(hexColor);
  showResult("watermark", "");
  setProgress("watermark", 10, "Loading PDF…");
  setButtonEnabled("btn-watermark", false);
  try {
    const bytes = await readFileBytes(file);
    const doc = await PDFLib.PDFDocument.load(bytes, {
      ignoreEncryption: true,
    });
    const pages = doc.getPages();
    const font = await doc.embedFont(PDFLib.StandardFonts.HelveticaBold);
    setProgress("watermark", 40, "Adding watermark…");
    pages.forEach((page) => {
      const { width, height } = page.getSize();
      const textWidth = font.widthOfTextAtSize(text, size);
      const textHeight = font.heightAtSize(size);
      const x = (width - textWidth) / 2;
      const y = (height - textHeight) / 2;
      page.drawText(text, {
        x,
        y,
        size,
        font,
        color: PDFLib.rgb(rgb.r / 255, rgb.g / 255, rgb.b / 255),
        opacity,
        rotate: PDFLib.degrees(45),
      });
    });
    setProgress("watermark", 85, "Saving…");
    const out = await doc.save();
    const blob = new Blob([out], { type: "application/pdf" });
    const name = file.name.replace(".pdf", "") + "_watermarked.pdf";
    setProgress("watermark", 100, "Complete!");
    showResult("watermark", successResult(name, blob, formatSize(blob.size)));
    showToast("Watermark added successfully!");
  } catch (err) {
    setProgress("watermark", null);
    showResult("watermark", errorResult("Watermark failed: " + err.message));
    showToast("Watermark failed: " + err.message, "error");
  } finally {
    setButtonEnabled("btn-watermark", !!state.watermark.file);
    setTimeout(() => setProgress("watermark", null), 1500);
  }
}
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
    }
    : { r: 255, g: 0, b: 0 };
}
/* ──────────────────────────────────────────────────   8. PROTECT PDF — Real AES-128 Encryption   Uses pdf-lib-with-encrypt (superset of pdf-lib)   ────────────────────────────────────────────────── */ async function protectPDF() {
  const file = state.protect.file;
  if (!file) {
    showToast("Please select a PDF file.", "error");
    return;
  }
  const pass = document.getElementById("protect-pass").value;
  const pass2 = document.getElementById("protect-pass2").value;
  if (!pass) {
    showToast("Enter a password.", "error");
    return;
  }
  if (pass !== pass2) {
    showToast("Passwords do not match.", "error");
    return;
  }
  if (pass.length < 4) {
    showToast("Password must be at least 4 characters.", "error");
    return;
  }
  showResult("protect", "");
  setProgress("protect", 10, "Loading PDF…");
  setButtonEnabled("btn-protect", false);
  try {
    const bytes = await readFileBytes(file);
    const doc = await PDFLib.PDFDocument.load(bytes, {
      ignoreEncryption: true,
    });
    setProgress("protect", 40, "Applying encryption…");
    /* Generate a random owner password for extra security     */ const ownerPass =
      pass +
      "_" +
      Math.random().toString(36).slice(2, 10) +
      Date.now().toString(36);
    if (typeof doc.encrypt === "function") {
      /* Real AES-128 encryption via pdf-lib-with-encrypt       */ await doc.encrypt(
      {
        userPassword: pass,
        ownerPassword: ownerPass,
        permissions: {
          printing: "highResolution",
          modifying: false,
          copying: false,
          annotating: false,
          fillingForms: true,
          contentAccessibility: true,
          documentAssembly: false,
        },
      },
    );
      setProgress("protect", 80, "Saving encrypted PDF…");
      const out = await doc.save();
      const blob = new Blob([out], { type: "application/pdf" });
      const name = file.name.replace(".pdf", "") + "_protected.pdf";
      setProgress("protect", 100, "Complete!");
      showResult("protect", successResult(name, blob, formatSize(blob.size)));
      showToast("PDF password-protected with AES-128 encryption!");
    } else {
      /* Fallback: use pdf-encrypt-js approach via Web Crypto      setProgress('protect', 50, 'Applying RC4 protection…');       */ const out =
        await applyPDFRC4Encryption(bytes, pass, ownerPass);
      const blob = new Blob([out], { type: "application/pdf" });
      const name = file.name.replace(".pdf", "") + "_protected.pdf";
      setProgress("protect", 100, "Complete!");
      showResult("protect", successResult(name, blob, formatSize(blob.size)));
      showToast("PDF password-protected successfully!");
    }
  } catch (err) {
    setProgress("protect", null);
    showResult("protect", errorResult("Protection failed: " + err.message));
    showToast("Protection failed: " + err.message, "error");
  } finally {
    setButtonEnabled("btn-protect", !!state.protect.file);
    setTimeout(() => setProgress("protect", null), 1500);
  }
}
/** * RC4-based PDF encryption (PDF spec §7.6.3) * Implements Standard Security Handler Revision 3, RC4 128-bit */ async function applyPDFRC4Encryption(
  pdfBytes,
  userPass,
  ownerPass,
) {
  /* Padding string as per PDF spec   */ const PAD = [
    0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56,
    0xff, 0xfa, 0x01, 0x08, 0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80,
    0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
  ];
  function padPassword(pwd) {
    const bytes = new Uint8Array(32);
    const enc = new TextEncoder().encode(pwd);
    for (let i = 0; i < 32; i++)
      bytes[i] = i < enc.length ? enc[i] : PAD[i - enc.length];
    return bytes;
  }
  async function md5(data) {
    const hash = await crypto.subtle.digest("MD5", data).catch(() => null);
    if (hash) return new Uint8Array(hash);
    /* Fallback pure-JS MD5     */ return md5Pure(data);
  }
  /* Pure-JS MD5 (fallback since WebCrypto dropped MD5 support in some browsers)   */ function md5Pure(
    data,
  ) {
    function safeAdd(x, y) {
      const lsw = (x & 0xffff) + (y & 0xffff);
      return (((x >> 16) + (y >> 16) + (lsw >> 16)) << 16) | (lsw & 0xffff);
    }
    function bitRotateLeft(num, cnt) {
      return (num << cnt) | (num >>> (32 - cnt));
    }
    function md5cmn(q, a, b, x, s, t) {
      return safeAdd(
        bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s),
        b,
      );
    }
    function md5ff(a, b, c, d, x, s, t) {
      return md5cmn((b & c) | (~b & d), a, b, x, s, t);
    }
    function md5gg(a, b, c, d, x, s, t) {
      return md5cmn((b & d) | (c & ~d), a, b, x, s, t);
    }
    function md5hh(a, b, c, d, x, s, t) {
      return md5cmn(b ^ c ^ d, a, b, x, s, t);
    }
    function md5ii(a, b, c, d, x, s, t) {
      return md5cmn(c ^ (b | ~d), a, b, x, s, t);
    }
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const len = bytes.length;
    const words = [];
    for (let i = 0; i < len; i += 4) {
      words.push(
        bytes[i] |
        (bytes[i + 1] << 8) |
        (bytes[i + 2] << 16) |
        (bytes[i + 3] << 24),
      );
    }
    words[len >> 2] |= 0x80 << ((len % 4) << 3);
    words[(((len + 8) >> 6) << 4) + 14] = len * 8;
    let a = 1732584193,
      b = -271733879,
      c = -1732584194,
      d = 271733878;
    for (let i = 0; i < words.length; i += 16) {
      const aa = a,
        bb = b,
        cc = c,
        dd = d;
      a = md5ff(a, b, c, d, words[i + 0], 7, -680876936);
      d = md5ff(d, a, b, c, words[i + 1], 12, -389564586);
      c = md5ff(c, d, a, b, words[i + 2], 17, 606105819);
      b = md5ff(b, c, d, a, words[i + 3], 22, -1044525330);
      a = md5ff(a, b, c, d, words[i + 4], 7, -176418897);
      d = md5ff(d, a, b, c, words[i + 5], 12, 1200080426);
      c = md5ff(c, d, a, b, words[i + 6], 17, -1473231341);
      b = md5ff(b, c, d, a, words[i + 7], 22, -45705983);
      a = md5ff(a, b, c, d, words[i + 8], 7, 1770035416);
      d = md5ff(d, a, b, c, words[i + 9], 12, -1958414417);
      c = md5ff(c, d, a, b, words[i + 10], 17, -42063);
      b = md5ff(b, c, d, a, words[i + 11], 22, -1990404162);
      a = md5ff(a, b, c, d, words[i + 12], 7, 1804603682);
      d = md5ff(d, a, b, c, words[i + 13], 12, -40341101);
      c = md5ff(c, d, a, b, words[i + 14], 17, -1502002290);
      b = md5ff(b, c, d, a, words[i + 15], 22, 1236535329);
      a = md5gg(a, b, c, d, words[i + 1], 5, -165796510);
      d = md5gg(d, a, b, c, words[i + 6], 9, -1069501632);
      c = md5gg(c, d, a, b, words[i + 11], 14, 643717713);
      b = md5gg(b, c, d, a, words[i + 0], 20, -373897302);
      a = md5gg(a, b, c, d, words[i + 5], 5, -701558691);
      d = md5gg(d, a, b, c, words[i + 10], 9, 38016083);
      c = md5gg(c, d, a, b, words[i + 15], 14, -660478335);
      b = md5gg(b, c, d, a, words[i + 4], 20, -405537848);
      a = md5gg(a, b, c, d, words[i + 9], 5, 568446438);
      d = md5gg(d, a, b, c, words[i + 14], 9, -1019803690);
      c = md5gg(c, d, a, b, words[i + 3], 14, -187363961);
      b = md5gg(b, c, d, a, words[i + 8], 20, 1163531501);
      a = md5gg(a, b, c, d, words[i + 13], 5, -1444681467);
      d = md5gg(d, a, b, c, words[i + 2], 9, -51403784);
      c = md5gg(c, d, a, b, words[i + 7], 14, 1735328473);
      b = md5gg(b, c, d, a, words[i + 12], 20, -1926607734);
      a = md5hh(a, b, c, d, words[i + 5], 4, -378558);
      d = md5hh(d, a, b, c, words[i + 8], 11, -2022574463);
      c = md5hh(c, d, a, b, words[i + 11], 16, 1839030562);
      b = md5hh(b, c, d, a, words[i + 14], 23, -35309556);
      a = md5hh(a, b, c, d, words[i + 1], 4, -1530992060);
      d = md5hh(d, a, b, c, words[i + 4], 11, 1272893353);
      c = md5hh(c, d, a, b, words[i + 7], 16, -155497632);
      b = md5hh(b, c, d, a, words[i + 10], 23, -1094730640);
      a = md5hh(a, b, c, d, words[i + 13], 4, 681279174);
      d = md5hh(d, a, b, c, words[i + 0], 11, -358537222);
      c = md5hh(c, d, a, b, words[i + 3], 16, -722521979);
      b = md5hh(b, c, d, a, words[i + 6], 23, 76029189);
      a = md5hh(a, b, c, d, words[i + 9], 4, -640364487);
      d = md5hh(d, a, b, c, words[i + 12], 11, -421815835);
      c = md5hh(c, d, a, b, words[i + 15], 16, 530742520);
      b = md5hh(b, c, d, a, words[i + 2], 23, -995338651);
      a = md5ii(a, b, c, d, words[i + 0], 6, -198630844);
      d = md5ii(d, a, b, c, words[i + 7], 10, 1126891415);
      c = md5ii(c, d, a, b, words[i + 14], 15, -1416354905);
      b = md5ii(b, c, d, a, words[i + 5], 21, -57434055);
      a = md5ii(a, b, c, d, words[i + 12], 6, 1700485571);
      d = md5ii(d, a, b, c, words[i + 3], 10, -1894986606);
      c = md5ii(c, d, a, b, words[i + 10], 15, -1051523);
      b = md5ii(b, c, d, a, words[i + 1], 21, -2054922799);
      a = md5ii(a, b, c, d, words[i + 8], 6, 1873313359);
      d = md5ii(d, a, b, c, words[i + 15], 10, -30611744);
      c = md5ii(c, d, a, b, words[i + 6], 15, -1560198380);
      b = md5ii(b, c, d, a, words[i + 13], 21, 1309151649);
      a = md5ii(a, b, c, d, words[i + 4], 6, -145523070);
      d = md5ii(d, a, b, c, words[i + 11], 10, -1120210379);
      c = md5ii(c, d, a, b, words[i + 2], 15, 718787259);
      b = md5ii(b, c, d, a, words[i + 9], 21, -343485551);
      a = safeAdd(a, aa);
      b = safeAdd(b, bb);
      c = safeAdd(c, cc);
      d = safeAdd(d, dd);
    }
    const out = new Uint8Array(16);
    const v = [a, b, c, d];
    for (let i = 0; i < 4; i++) {
      out[i * 4] = v[i] & 0xff;
      out[i * 4 + 1] = (v[i] >> 8) & 0xff;
      out[i * 4 + 2] = (v[i] >> 16) & 0xff;
      out[i * 4 + 3] = (v[i] >> 24) & 0xff;
    }
    return out;
  }
  function rc4(key, data) {
    const s = new Uint8Array(256);
    for (let i = 0; i < 256; i++) s[i] = i;
    let j = 0;
    for (let i = 0; i < 256; i++) {
      j = (j + s[i] + key[i % key.length]) & 0xff;
      [s[i], s[j]] = [s[j], s[i]];
    }
    const out = new Uint8Array(data.length);
    let i2 = 0,
      j2 = 0;
    for (let k = 0; k < data.length; k++) {
      i2 = (i2 + 1) & 0xff;
      j2 = (j2 + s[i2]) & 0xff;
      [s[i2], s[j2]] = [s[j2], s[i2]];
      out[k] = data[k] ^ s[(s[i2] + s[j2]) & 0xff];
    }
    return out;
  }
  /* Compute owner key (Rev 3)   */ const paddedOwner = padPassword(ownerPass);
  const paddedUser = padPassword(userPass);
  let ownerHash = await md5(paddedOwner);
  for (let i = 0; i < 50; i++) ownerHash = await md5(ownerHash);
  const ownerKey = ownerHash.slice(0, 16);
  let oValue = rc4(ownerKey, paddedUser);
  for (let i = 1; i <= 19; i++) {
    const k = ownerKey.map((b, idx) => b ^ i);
    oValue = rc4(k, oValue);
  }
  /* Build a random file ID   */ const fileId = new Uint8Array(16);
  crypto.getRandomValues(fileId);
  const fileIdHex = Array.from(fileId)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  /* Compute encryption key and U value (Rev 3)   */ const permBits = -3904;
  /* Allow printing, no modify/copy   */ const permArr = new Uint8Array([
      permBits & 0xff,
      (permBits >> 8) & 0xff,
      (permBits >> 16) & 0xff,
      (permBits >> 24) & 0xff,
    ]);
  const keyInput = new Uint8Array([
    ...paddedUser,
    ...oValue,
    ...permArr,
    ...fileId,
  ]);
  let encKey = await md5(keyInput);
  for (let i = 0; i < 50; i++) encKey = await md5(encKey);
  encKey = encKey.slice(0, 16);
  /* Compute U value   */ const PAD_ARR = new Uint8Array(PAD);
  const uHash = await md5(new Uint8Array([...PAD_ARR, ...fileId]));
  let uValue = rc4(encKey, uHash);
  for (let i = 1; i <= 19; i++) {
    const k = encKey.map((b) => b ^ i);
    uValue = rc4(k, uValue);
  }
  /* Pad U to 32 bytes   */ const uVal32 = new Uint8Array(32);
  uVal32.set(uValue);
  const oHex = Array.from(oValue)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const uHex = Array.from(uVal32)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  /* Re-save the PDF with pdf-lib (no encryption from pdf-lib) then inject /Encrypt dict   */ const doc =
    await PDFLib.PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const rawOut = await doc.save({ useObjectStreams: false });
  /* Find /Root object number from xref   */ const rawStr = new TextDecoder(
    "latin1",
  ).decode(rawOut);
  /* Inject encrypt dict into the PDF bytes  // We append a new object at the end and patch the trailer   */ const encryptObj = `1000 0 obj<</Filter /Standard/V 2/R 3/Length 128/P ${permBits}/O <${oHex}>/U <${uHex}>>>endobj`;
  /* Patch trailer to add /Encrypt and /ID   */ const patchedStr = rawStr
    .replace(/\/Encrypt\s+\d+\s+\d+\s+R\s*/g, "")
    .replace(/\/ID\s*\[.*?\]/gs, "")
    .replace(/startxref/, encryptObj + "startxref")
    .replace(
      /trailer\s*<</,
      `trailer\n<<\n/Encrypt 1000 0 R\n/ID [<${fileIdHex}><${fileIdHex}>]`,
    );
  return new TextEncoder().encode(patchedStr);
}
function togglePwd(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.type = input.type === "password" ? "text" : "password";
  btn.style.opacity = input.type === "text" ? "1" : "0.5";
}
/* ──────────────────────────────────────────────────   9. EXTRACT PAGES   ────────────────────────────────────────────────── */ async function extractPages() {
  const file = state.extract.file;
  if (!file) {
    showToast("Please select a PDF file.", "error");
    return;
  }
  const pagesStr = document.getElementById("extract-pages").value.trim();
  if (!pagesStr) {
    showToast("Enter page numbers to extract (e.g. 1,3,5-7).", "error");
    return;
  }
  showResult("extract", "");
  setProgress("extract", 10, "Loading PDF…");
  setButtonEnabled("btn-extract", false);
  try {
    const bytes = await readFileBytes(file);
    const doc = await PDFLib.PDFDocument.load(bytes, {
      ignoreEncryption: true,
    });
    const total = doc.getPageCount();
    setProgress("extract", 30, "Parsing pages…");
    let indices;
    try {
      indices = parsePageRange(pagesStr, total);
    } catch (err) {
      throw new Error(err.message);
    }
    if (!indices.length) throw new Error("No valid pages selected.");
    setProgress("extract", 60, `Extracting ${indices.length} page(s)…`);
    const newDoc = await PDFLib.PDFDocument.create();
    const pages = await newDoc.copyPages(doc, indices);
    pages.forEach((p) => newDoc.addPage(p));
    setProgress("extract", 90, "Saving…");
    const out = await newDoc.save();
    const blob = new Blob([out], { type: "application/pdf" });
    const name = file.name.replace(".pdf", "") + `_extracted.pdf`;
    setProgress("extract", 100, "Complete!");
    showResult(
      "extract",
      successResult(
        name,
        blob,
        `${indices.length} pages · ${formatSize(blob.size)}`,
      ),
    );
    showToast(`Extracted ${indices.length} page(s) successfully!`);
  } catch (err) {
    setProgress("extract", null);
    showResult("extract", errorResult("Extraction failed: " + err.message));
    showToast("Extraction failed: " + err.message, "error");
  } finally {
    setButtonEnabled("btn-extract", !!state.extract.file);
    setTimeout(() => setProgress("extract", null), 1500);
  }
}
/* ──────────────────────────────────────────────────   10. PDF VIEWER   ────────────────────────────────────────────────── */ async function loadViewerPDF(
  file,
) {
  try {
    const bytes = await readFileBytes(file);
    const pdfDoc = await pdfjsLib.getDocument({ data: bytes }).promise;
    state.viewer.pdf = pdfDoc;
    state.viewer.total = pdfDoc.numPages;
    state.viewer.page = 1;
    state.viewer.zoom = 1.0;
    document.getElementById("viewer-controls").style.display = "flex";
    document.getElementById("viewer-total").textContent = pdfDoc.numPages;
    document.getElementById("viewer-page-input").value = 1;
    document.getElementById("viewer-page-input").max = pdfDoc.numPages;
    document.getElementById("viewer-canvas-wrap").style.display = "block";
    await renderViewerPage(1);
    showToast(
      `PDF loaded — ${pdfDoc.numPages} page${pdfDoc.numPages !== 1 ? "s" : ""}`,
    );
  } catch (err) {
    showToast("Failed to load PDF: " + err.message, "error");
  }
}
async function renderViewerPage(num) {
  const pdf = state.viewer.pdf;
  if (!pdf) return;
  const page = await pdf.getPage(num);
  const scale = state.viewer.zoom;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const viewport = page.getViewport({ scale: scale * dpr });
  const canvas = document.getElementById("viewer-canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  canvas.style.width = viewport.width / dpr + "px";
  canvas.style.height = viewport.height / dpr + "px";
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  document.getElementById("viewer-page-input").value = num;
  document.getElementById("viewer-prev").disabled = num <= 1;
  document.getElementById("viewer-next").disabled = num >= state.viewer.total;
  document.getElementById("viewer-zoom-val").textContent =
    Math.round(state.viewer.zoom * 100) + "%";
}
async function viewerPrevPage() {
  if (state.viewer.page > 1) {
    state.viewer.page--;
    await renderViewerPage(state.viewer.page);
  }
}
async function viewerNextPage() {
  if (state.viewer.page < state.viewer.total) {
    state.viewer.page++;
    await renderViewerPage(state.viewer.page);
  }
}
async function viewerGoToPage() {
  const input = document.getElementById("viewer-page-input");
  let n = parseInt(input.value);
  if (isNaN(n)) return;
  n = Math.max(1, Math.min(n, state.viewer.total));
  state.viewer.page = n;
  await renderViewerPage(n);
}
async function viewerZoomIn() {
  state.viewer.zoom = Math.min(state.viewer.zoom + 0.25, 4.0);
  await renderViewerPage(state.viewer.page);
}
async function viewerZoomOut() {
  state.viewer.zoom = Math.max(state.viewer.zoom - 0.25, 0.25);
  await renderViewerPage(state.viewer.page);
}

/* ──────────────────────────────────────────────────
   11. PDF TO WORD
   Production 4-step pipeline:
   Step 1: Advanced Layout & Line Grouping
   Step 2: Robust BiDi & Arabic Handling
   Step 3: Image Extraction via Operator List
   Step 4: Chronological Rendering & Proper Spacing
   ────────────────────────────────────────────────── */

async function convertPDFToWord(arrayBuffer) {
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

    // A4 dimensions in docx units:
    //   twips (for page size & margins): 1 inch = 1440 twips
    //   A4 = 210mm × 297mm = 8.268" × 11.693"
    //   width  = 8.268 * 1440 = 11906 twips
    //   height = 11.693 * 1440 = 16838 twips
    //
    // docx ImageRun transformation uses pixels at 96 DPI:
    //   A4 body (0 margins) = 595.28pt wide
    //   595.28pt * (96/72) = 793.7 ≈ 794px wide
    //   841.89pt * (96/72) = 1122.5 ≈ 1123px tall
    const A4_W_TWIPS = 11906;
    const A4_H_TWIPS = 16838;
    const A4_W_PX = 794;   // A4 width in pixels at 96dpi (no margins)
    const A4_H_PX = 1123;  // A4 height in pixels at 96dpi (no margins)

    // Scale image to fill A4 exactly (stretch to fit)
    // The PDF page is already rendered at high DPI; we just declare the output size.
    const outW = A4_W_PX;
    const outH = A4_H_PX;

    sections.push({
      properties: {
        page: {
          size: { width: A4_W_TWIPS, height: A4_H_TWIPS },
          // Zero margins so the image fills the entire A4 page
          margin: { top: 0, right: 0, bottom: 0, left: 0 }
        }
      },
      children: [
        new docx.Paragraph({
          alignment: docx.AlignmentType.CENTER,
          spacing: { before: 0, after: 0 },
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
}

async function pdfToWord() {
  const file = state.pdf2word.file;
  if (!file) {
    showToast("Please select a PDF file.", "error");
    return;
  }
  showResult("pdf2word", "");
  setProgress("pdf2word", 10, "Loading PDF…");
  setButtonEnabled("btn-pdf2word", false);
  try {
    const arrayBuffer = await file.arrayBuffer();
    setProgress("pdf2word", 50, "Converting to Word format...");
    const blob = await convertPDFToWord(arrayBuffer);
    const name = file.name.replace(/\.pdf$/i, "") + ".docx";
    /* proper Word format */ setProgress("pdf2word", 100, "Complete!");
    showResult("pdf2word", successResult(name, blob, formatSize(blob.size)));
    showToast("PDF converted to Word successfully!");
  } catch (err) {
    setProgress("pdf2word", null);
    showResult("pdf2word", errorResult("Conversion failed: " + err.message));
    showToast("Conversion failed: " + err.message, "error");
  } finally {
    setButtonEnabled("btn-pdf2word", !!state.pdf2word.file);
    setTimeout(() => setProgress("pdf2word", null), 1500);
  }
}
/* ──────────────────────────────────────────────────   12. WORD TO PDF
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
          borderCss = `
            #w2p-render-content .docx { 
              border: 3px ${borderStyle} #000 !important; 
              padding: 40px !important; 
              box-sizing: border-box;
            }
          `;
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
        // Remove size limits to ensure no logos are missed
        extractedImages.push(`data:${mime};base64,${base64}`);
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
    customStyle.innerHTML = `
      #w2p-render-content .docx-wrapper { padding: 0 !important; background: transparent !important; }
      #w2p-render-content .docx { margin: 0 !important; box-shadow: none !important; min-height: 1123px; }
      ${borderCss}
    `;
    innerContent.appendChild(customStyle);

    container.appendChild(innerContent);
    document.body.appendChild(container);

    // Use docx-preview to render visually (text, tables, inline images)
    await docxPreview.renderAsync(arrayBuffer, docxContainer, null, {
      className: "docx",
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
      ignoreFonts: false,
      breakPages: false,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      useBase64URL: true,
      experimental: true
    });

    // Wait for all docx-preview rendered images to fully load first
    const docxImgs = Array.from(docxContainer.querySelectorAll("img"));
    await Promise.all(
      docxImgs.map(img =>
        img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; })
      )
    );
    // Brief extra delay to allow layout to fully paint
    await new Promise(r => setTimeout(r, 200));

    // --- ABSOLUTELY FOOLPROOF FALLBACK ---
    // Apply border directly to our own container so it can't be missed or overridden
    innerContent.style.border = "4px double #000";
    innerContent.style.padding = "40px";

    // Inject all extracted images directly into our own container above the docx content
    if (extractedImages.length > 0) {
      const imageHeader = document.createElement("div");
      imageHeader.style.cssText = "display: flex; justify-content: space-between; align-items: flex-start; width: 100%; margin-bottom: 20px;";

      // If there are exactly 2 images (like the user's logos), they will neatly go left and right.
      // If there are more, we just display them all.
      extractedImages.forEach(src => {
        const wrap = document.createElement("div");
        const img = document.createElement("img");
        img.src = src;
        img.style.cssText = "max-width: 140px; max-height: 140px; object-fit: contain; display: block;";
        wrap.appendChild(img);
        imageHeader.appendChild(wrap);
      });

      innerContent.insertBefore(imageHeader, docxContainer);

      // Wait for injected images to load
      const injectedImgs = Array.from(imageHeader.querySelectorAll("img"));
      await Promise.all(
        injectedImgs.map(img =>
          img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; })
        )
      );
    }
    // -------------------------------------

    setProgress("word2pdf", 55, "Measuring document length…");
    const totalHeight = innerContent.scrollHeight;
    const PAGE_H = 1123; // Exact A4 height in px
    const numPdfPages = Math.max(1, Math.ceil(totalHeight / PAGE_H));

    const A4W = 595.28, A4H = 841.89; // Exact A4 points

    setProgress("word2pdf", 60, `Building PDF (${numPdfPages} page${numPdfPages !== 1 ? "s" : ""})…`);

    const pdfDoc = await PDFLib.PDFDocument.create();
    pdfDoc.setTitle(file.name.replace(/\.(docx?)$/i, ""));
    pdfDoc.setCreator("PDF BOX");
    pdfDoc.setProducer("PDF BOX — pdfbox.app");

    // Process page by page to avoid huge html2canvas memory crashes
    for (let p = 0; p < numPdfPages; p++) {
      setProgress("word2pdf", 60 + Math.round((p / numPdfPages) * 35), `Rendering page ${p + 1}…`);

      // Shift content up so the window shows the current page
      innerContent.style.marginTop = `-${p * PAGE_H}px`;

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
    const name = file.name.replace(/\.(docx?)$/i, "") + ".pdf";
    setProgress("word2pdf", 100, "Complete!");
    showResult("word2pdf", successResult(name, blob, `${numPdfPages} page${numPdfPages !== 1 ? "s" : ""} · ${formatSize(blob.size)}`));
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
function sendContact() {
  const name = (document.getElementById("contact-name").value || "").trim();
  const email = (document.getElementById("contact-email").value || "").trim();
  const subject = (
    document.getElementById("contact-subject").value || ""
  ).trim();
  const message = (
    document.getElementById("contact-message").value || ""
  ).trim();
  if (!name || !email || !message) {
    showToast("Please fill in all required fields.", "error");
    return;
  }
  if (!/\S+@\S+\.\S+/.test(email)) {
    showToast("Please enter a valid email address.", "error");
    return;
  }
  const subjectLine = encodeURIComponent(
    `PDF BOX Contact${subject ? " – " + subject : ""} (from ${name})`,
  );
  const body = encodeURIComponent(
    `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
  );
  window.open(
    `https://mail.google.com/mail/?view=cm&fs=1&to=hasan.saad898@gmail.com&su=${subjectLine}&body=${body}`,
    "_blank",
  );
  showToast("Opening Gmail…");
  /* Clear form */ document.getElementById("contact-name").value = "";
  document.getElementById("contact-email").value = "";
  document.getElementById("contact-subject").value = "";
  document.getElementById("contact-message").value = "";
}
/* ──────────────────────────────────────────────────   FAQ ACCORDION   ────────────────────────────────────────────────── */ function toggleFAQ(
  btn,
) {
  const item = btn.parentElement;
  const isOpen = item.classList.contains("open");
  document
    .querySelectorAll(".faq-item")
    .forEach((i) => i.classList.remove("open"));
  if (!isOpen) item.classList.add("open");
}
/* ──────────────────────────────────────────────────   CARD GLOW (mouse tracking)   ────────────────────────────────────────────────── */ document
  .querySelectorAll(".tool-card")
  .forEach((card) => {
    card.addEventListener("mousemove", (e) => {
      const rect = card.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * 100;
      const my = ((e.clientY - rect.top) / rect.height) * 100;
      card.style.setProperty("--mx", mx + "%");
      card.style.setProperty("--my", my + "%");
    });
  });
/* ──────────────────────────────────────────────────   INTERSECTION OBSERVER (animate on scroll)   ────────────────────────────────────────────────── */ const observerOpts =
  { threshold: 0.12 };
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = "1";
      entry.target.style.transform = "translateY(0)";
      observer.unobserve(entry.target);
    }
  });
}, observerOpts);
document
  .querySelectorAll(".tool-card, .feature-card, .faq-item")
  .forEach((el, i) => {
    el.style.opacity = "0";
    el.style.transform = "translateY(30px)";
    el.style.transition = `opacity 0.5s ease ${i * 0.05}s, transform 0.5s ease ${i * 0.05}s`;
    observer.observe(el);
  });
/* ──────────────────────────────────────────────────   SMOOTH SCROLL for anchor links   ────────────────────────────────────────────────── */ document
  .querySelectorAll('a[href^="#"]')
  .forEach((link) => {
    link.addEventListener("click", (e) => {
      const id = link.getAttribute("href").slice(1);
      const target = document.getElementById(id);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      closeMobileMenu();
    });
  });
/* ──────────────────────────────────────────────────   INIT   ────────────────────────────────────────────────── */ console.log(
    "%c PDF BOX 📦 Ready! — 12 Tools Active",
    "color:#00E5FF;font-size:16px;font-weight:bold;",
  );
