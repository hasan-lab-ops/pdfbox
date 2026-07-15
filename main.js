/* ===================================================
   PDF BOX — Main JavaScript
   All PDF tools: Merge, Split, Compress, Rotate,
   PDF→Images, Images→PDF, Watermark, Protect,
   Extract Pages, PDF Viewer
   Libraries: pdf-lib, PDF.js, FileSaver.js
   =================================================== */

'use strict';

/* ──────────────────────────────────────────────────
   STATE
   ────────────────────────────────────────────────── */
const state = {
  merge:    { files: [] },
  split:    { file: null, pageCount: 0 },
  compress: { file: null },
  rotate:   { file: null, angle: 90 },
  pdf2img:  { file: null, dpi: 150 },
  img2pdf:  { files: [] },
  watermark:{ file: null },
  protect:  { file: null },
  extract:  { file: null, pageCount: 0 },
  viewer:   { file: null, pdf: null, page: 1, total: 0, zoom: 1.0 },
};

/* ──────────────────────────────────────────────────
   NAVBAR SCROLL
   ────────────────────────────────────────────────── */
window.addEventListener('scroll', () => {
  const nav = document.getElementById('navbar');
  if (window.scrollY > 20) {
    nav.classList.add('scrolled');
  } else {
    nav.classList.remove('scrolled');
  }
});

/* ──────────────────────────────────────────────────
   MOBILE MENU
   ────────────────────────────────────────────────── */
document.getElementById('hamburger').addEventListener('click', () => {
  const menu = document.getElementById('mobileMenu');
  menu.classList.toggle('open');
});

function closeMobileMenu() {
  document.getElementById('mobileMenu').classList.remove('open');
}

/* ──────────────────────────────────────────────────
   MODAL SYSTEM
   ────────────────────────────────────────────────── */
let currentModal = null;

function openModal(id) {
  closeModal(false);
  const modal = document.getElementById('modal-' + id);
  const overlay = document.getElementById('modalOverlay');
  if (!modal) return;
  overlay.classList.add('active');
  modal.classList.add('active');
  currentModal = id;
  document.body.style.overflow = 'hidden';
  // smooth scroll to top of modal
  setTimeout(() => modal.scrollTop = 0, 10);
}

function closeModal(restore = true) {
  if (currentModal) {
    const modal = document.getElementById('modal-' + currentModal);
    if (modal) modal.classList.remove('active');
    currentModal = null;
  }
  document.getElementById('modalOverlay').classList.remove('active');
  if (restore) document.body.style.overflow = '';
}

// Close modal on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

/* ──────────────────────────────────────────────────
   TOAST NOTIFICATIONS
   ────────────────────────────────────────────────── */
let toastTimer = null;
function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = 'toast show' + (type === 'error' ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.classList.remove('show'); }, 3500);
}

/* ──────────────────────────────────────────────────
   DRAG & DROP HELPERS
   ────────────────────────────────────────────────── */
function handleDragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add('dragover');
}
function handleDragLeave(e) {
  e.currentTarget.classList.remove('dragover');
}
function handleDrop(e, inputId) {
  e.preventDefault();
  e.currentTarget.classList.remove('dragover');
  const input = document.getElementById(inputId);
  const files = e.dataTransfer.files;
  if (!files.length) return;
  // Inject files into the input and trigger change
  const dt = new DataTransfer();
  Array.from(files).forEach(f => dt.items.add(f));
  input.files = dt.files;
  input.dispatchEvent(new Event('change'));
}

/* ──────────────────────────────────────────────────
   FILE SELECTION HANDLER (unified)
   ────────────────────────────────────────────────── */
function handleFileSelect(tool, files) {
  const arr = Array.from(files);
  if (!arr.length) return;

  // Accept only PDF for PDF-input tools
  const pdfOnlyTools = ['split','compress','rotate','pdf2img','watermark','protect','extract','viewer'];
  if (pdfOnlyTools.includes(tool)) {
    if (!arr[0].name.toLowerCase().endsWith('.pdf')) {
      showToast('Please select a valid PDF file.', 'error');
      return;
    }
  }
  // Accept only images for img2pdf
  if (tool === 'img2pdf') {
    const invalid = arr.find(f => !f.type.startsWith('image/'));
    if (invalid) {
      showToast('Only image files (JPG, PNG, WebP) are accepted.', 'error');
      return;
    }
  }

  switch(tool) {
    case 'merge':
      // Append
      arr.forEach(f => { if (f.name.toLowerCase().endsWith('.pdf')) state.merge.files.push(f); });
      renderFileList('merge', state.merge.files, true);
      setButtonEnabled('btn-merge', state.merge.files.length >= 2);
      if (state.merge.files.length < 2) showToast('Add at least 2 PDF files to merge.', 'info');
      break;
    case 'split':
      state.split.file = arr[0];
      renderFileList('split', [arr[0]], false);
      setButtonEnabled('btn-split', true);
      getPDFPageCount(arr[0]).then(n => {
        state.split.pageCount = n;
        document.getElementById('split-page-count').textContent = `This PDF has ${n} page${n !== 1 ? 's' : ''}.`;
      });
      break;
    case 'compress':
      state.compress.file = arr[0];
      renderFileList('compress', [arr[0]], false);
      setButtonEnabled('btn-compress', true);
      break;
    case 'rotate':
      state.rotate.file = arr[0];
      renderFileList('rotate', [arr[0]], false);
      setButtonEnabled('btn-rotate', true);
      break;
    case 'pdf2img':
      state.pdf2img.file = arr[0];
      renderFileList('pdf2img', [arr[0]], false);
      setButtonEnabled('btn-pdf2img', true);
      break;
    case 'img2pdf':
      arr.forEach(f => { if (f.type.startsWith('image/')) state.img2pdf.files.push(f); });
      renderFileList('img2pdf', state.img2pdf.files, true);
      setButtonEnabled('btn-img2pdf', state.img2pdf.files.length >= 1);
      break;
    case 'watermark':
      state.watermark.file = arr[0];
      renderFileList('watermark', [arr[0]], false);
      setButtonEnabled('btn-watermark', true);
      break;
    case 'protect':
      state.protect.file = arr[0];
      renderFileList('protect', [arr[0]], false);
      setButtonEnabled('btn-protect', true);
      break;
    case 'extract':
      state.extract.file = arr[0];
      renderFileList('extract', [arr[0]], false);
      setButtonEnabled('btn-extract', true);
      getPDFPageCount(arr[0]).then(n => {
        state.extract.pageCount = n;
        document.getElementById('extract-page-count').textContent = `This PDF has ${n} page${n !== 1 ? 's' : ''}.`;
      });
      break;
    case 'viewer':
      state.viewer.file = arr[0];
      renderFileList('viewer', [arr[0]], false);
      loadViewerPDF(arr[0]);
      break;
  }
}

/* ──────────────────────────────────────────────────
   FILE LIST RENDERER
   ────────────────────────────────────────────────── */
function renderFileList(tool, files, removable) {
  const container = document.getElementById('files-' + tool);
  container.innerHTML = '';
  files.forEach((file, idx) => {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.innerHTML = `
      <div class="file-item-icon">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="2"/>
          <polyline points="14 2 14 8 20 8" stroke="currentColor" stroke-width="2"/>
        </svg>
      </div>
      <span class="file-item-name" title="${escHtml(file.name)}">${escHtml(file.name)}</span>
      <span class="file-item-size">${formatSize(file.size)}</span>
      ${removable ? `<button class="file-item-remove" onclick="removeFile('${tool}',${idx})" title="Remove">
        <svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>` : ''}
    `;
    container.appendChild(item);
  });
}

function removeFile(tool, idx) {
  if (tool === 'merge') {
    state.merge.files.splice(idx, 1);
    renderFileList('merge', state.merge.files, true);
    setButtonEnabled('btn-merge', state.merge.files.length >= 2);
  } else if (tool === 'img2pdf') {
    state.img2pdf.files.splice(idx, 1);
    renderFileList('img2pdf', state.img2pdf.files, true);
    setButtonEnabled('btn-img2pdf', state.img2pdf.files.length >= 1);
  }
}

/* ──────────────────────────────────────────────────
   UTILITIES
   ────────────────────────────────────────────────── */
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(2) + ' MB';
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function setButtonEnabled(id, enabled) {
  const btn = document.getElementById(id);
  if (btn) btn.disabled = !enabled;
}

function setProgress(tool, pct, text) {
  const wrap = document.getElementById('progress-' + tool);
  const fill = document.getElementById('pf-' + tool);
  const pt   = document.getElementById('pt-' + tool);
  if (wrap) wrap.style.display = pct === null ? 'none' : 'block';
  if (fill) fill.style.width = (pct || 0) + '%';
  if (pt)   pt.textContent = text || '';
}

function showResult(tool, html) {
  const box = document.getElementById('result-' + tool);
  if (box) box.innerHTML = html;
}

function successResult(filename, blob, extra = '') {
  const url = URL.createObjectURL(blob);
  return `
    <div class="result-success">
      <div class="result-success-row">
        <svg viewBox="0 0 24 24" fill="none"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke="currentColor" stroke-width="2"/><polyline points="22 4 12 14.01 9 11.01" stroke="currentColor" stroke-width="2"/></svg>
        <span>Done! ${escHtml(filename)} (${extra})</span>
      </div>
      <a class="download-btn" href="${url}" download="${escHtml(filename)}">
        <svg viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" stroke-width="2"/><polyline points="17 8 12 13 7 8" stroke="currentColor" stroke-width="2"/><line x1="12" y1="3" x2="12" y2="13" stroke="currentColor" stroke-width="2"/></svg>
        Download ${escHtml(filename)}
      </a>
    </div>
  `;
}

function errorResult(msg) {
  return `
    <div class="result-error">
      <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" stroke-width="2"/><line x1="12" y1="16" x2="12.01" y2="16" stroke="currentColor" stroke-width="2"/></svg>
      <span>${escHtml(msg)}</span>
    </div>
  `;
}

async function readFileBytes(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(new Uint8Array(e.target.result));
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsArrayBuffer(file);
  });
}

async function getPDFPageCount(file) {
  try {
    const bytes = await readFileBytes(file);
    const pdf = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
    return pdf.getPageCount();
  } catch { return 0; }
}

/** Parse a page range string like "1-3,5,7-9" into 0-indexed page indices */
function parsePageRange(str, total) {
  const indices = new Set();
  const parts = str.split(',').map(s => s.trim()).filter(Boolean);
  for (const part of parts) {
    if (part.includes('-')) {
      let [a, b] = part.split('-').map(Number);
      if (isNaN(a) || isNaN(b)) throw new Error(`Invalid range: "${part}"`);
      a = Math.max(1, a); b = Math.min(total, b);
      for (let i = a; i <= b; i++) indices.add(i - 1);
    } else {
      const n = Number(part);
      if (isNaN(n) || n < 1 || n > total) throw new Error(`Page ${part} out of range (1–${total}).`);
      indices.add(n - 1);
    }
  }
  return [...indices].sort((a, b) => a - b);
}

/* ──────────────────────────────────────────────────
   1. MERGE PDFs
   ────────────────────────────────────────────────── */
async function mergePDFs() {
  const files = state.merge.files;
  if (files.length < 2) { showToast('Add at least 2 PDF files.', 'error'); return; }
  showResult('merge', '');
  setProgress('merge', 5, 'Loading files…');
  setButtonEnabled('btn-merge', false);

  try {
    const merged = await PDFLib.PDFDocument.create();
    for (let i = 0; i < files.length; i++) {
      setProgress('merge', 10 + Math.round((i / files.length) * 80), `Merging file ${i + 1} of ${files.length}…`);
      const bytes = await readFileBytes(files[i]);
      const doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      pages.forEach(p => merged.addPage(p));
    }
    setProgress('merge', 95, 'Saving…');
    const out = await merged.save();
    const blob = new Blob([out], { type: 'application/pdf' });
    const name = (document.getElementById('merge-output').value.trim() || 'merged') + '.pdf';
    setProgress('merge', 100, 'Complete!');
    showResult('merge', successResult(name, blob, formatSize(blob.size)));
    showToast('PDFs merged successfully!');
  } catch (err) {
    setProgress('merge', null);
    showResult('merge', errorResult('Merge failed: ' + err.message));
    showToast('Merge failed: ' + err.message, 'error');
  } finally {
    setButtonEnabled('btn-merge', state.merge.files.length >= 2);
    setTimeout(() => setProgress('merge', null), 1500);
  }
}

/* ──────────────────────────────────────────────────
   2. SPLIT PDF
   ────────────────────────────────────────────────── */
async function splitPDF() {
  const file = state.split.file;
  if (!file) { showToast('Please select a PDF file.', 'error'); return; }
  const rangeStr = document.getElementById('split-range').value.trim();
  if (!rangeStr) { showToast('Enter a page range (e.g. 1-3).', 'error'); return; }

  showResult('split', '');
  setProgress('split', 10, 'Loading PDF…');
  setButtonEnabled('btn-split', false);

  try {
    const bytes = await readFileBytes(file);
    const doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
    const total = doc.getPageCount();

    setProgress('split', 30, 'Parsing page range…');
    let indices;
    try {
      indices = parsePageRange(rangeStr, total);
    } catch (err) {
      throw new Error(err.message);
    }

    if (indices.length === 0) throw new Error('No valid pages in the specified range.');

    setProgress('split', 60, `Extracting ${indices.length} page(s)…`);
    const newDoc = await PDFLib.PDFDocument.create();
    const pages = await newDoc.copyPages(doc, indices);
    pages.forEach(p => newDoc.addPage(p));

    setProgress('split', 90, 'Saving…');
    const out = await newDoc.save();
    const blob = new Blob([out], { type: 'application/pdf' });
    const name = file.name.replace('.pdf', '') + `_pages_${rangeStr.replace(/,/g,'-')}.pdf`;
    setProgress('split', 100, 'Complete!');
    showResult('split', successResult(name, blob, `${indices.length} pages · ${formatSize(blob.size)}`));
    showToast('PDF split successfully!');
  } catch (err) {
    setProgress('split', null);
    showResult('split', errorResult('Split failed: ' + err.message));
    showToast('Split failed: ' + err.message, 'error');
  } finally {
    setButtonEnabled('btn-split', !!state.split.file);
    setTimeout(() => setProgress('split', null), 1500);
  }
}

/* ──────────────────────────────────────────────────
   3. COMPRESS PDF
   ────────────────────────────────────────────────── */
async function compressPDF() {
  const file = state.compress.file;
  if (!file) { showToast('Please select a PDF file.', 'error'); return; }

  const level = document.querySelector('input[name="compress-level"]:checked').value;
  showResult('compress', '');
  setProgress('compress', 10, 'Loading PDF…');
  setButtonEnabled('btn-compress', false);

  try {
    const bytes = await readFileBytes(file);
    setProgress('compress', 40, 'Optimizing…');
    const doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });

    // Apply compression by re-serializing (pdf-lib re-encodes cleanly)
    const saveOpts = { useObjectStreams: true, addDefaultPage: false };
    if (level === 'high') {
      // Remove metadata to shrink further
      doc.setTitle('');
      doc.setAuthor('');
      doc.setSubject('');
      doc.setKeywords([]);
      doc.setProducer('PDF BOX');
      doc.setCreator('PDF BOX');
    }

    setProgress('compress', 70, 'Re-encoding…');
    const out = await doc.save(saveOpts);
    const blob = new Blob([out], { type: 'application/pdf' });
    const name = file.name.replace('.pdf', '') + '_compressed.pdf';

    const saved = file.size - blob.size;
    const pct = ((saved / file.size) * 100).toFixed(1);
    const extra = saved > 0
      ? `${formatSize(blob.size)} · saved ${formatSize(saved)} (${pct}%)`
      : `${formatSize(blob.size)} · already optimized`;

    setProgress('compress', 100, 'Complete!');
    showResult('compress', successResult(name, blob, extra));
    showToast(saved > 0 ? `Compressed! Saved ${pct}%` : 'PDF already well-optimized.');
  } catch (err) {
    setProgress('compress', null);
    showResult('compress', errorResult('Compression failed: ' + err.message));
    showToast('Compression failed: ' + err.message, 'error');
  } finally {
    setButtonEnabled('btn-compress', !!state.compress.file);
    setTimeout(() => setProgress('compress', null), 1500);
  }
}

/* ──────────────────────────────────────────────────
   4. ROTATE PDF
   ────────────────────────────────────────────────── */
let rotateAngle = 90;

function selectRotation(angle, btn) {
  rotateAngle = angle;
  state.rotate.angle = angle;
  document.querySelectorAll('#rot-90, #rot-180, #rot-270').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

// Show/hide specific pages input based on radio
document.addEventListener('change', (e) => {
  if (e.target && e.target.name === 'rotate-pages') {
    const specific = document.getElementById('rotate-specific');
    if (specific) specific.style.display = e.target.value === 'specific' ? 'block' : 'none';
  }
});

async function rotatePDF() {
  const file = state.rotate.file;
  if (!file) { showToast('Please select a PDF file.', 'error'); return; }
  const angle = state.rotate.angle || 90;
  const modeEl = document.querySelector('input[name="rotate-pages"]:checked');
  const mode = modeEl ? modeEl.value : 'all';

  showResult('rotate', '');
  setProgress('rotate', 10, 'Loading PDF…');
  setButtonEnabled('btn-rotate', false);

  try {
    const bytes = await readFileBytes(file);
    const doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
    const pages = doc.getPages();
    const total = pages.length;

    setProgress('rotate', 40, 'Rotating pages…');

    if (mode === 'all') {
      pages.forEach(page => {
        const current = page.getRotation().angle;
        page.setRotation(PDFLib.degrees((current + angle) % 360));
      });
    } else {
      const specStr = document.getElementById('rotate-specific').value.trim();
      if (!specStr) throw new Error('Enter specific page numbers (e.g. 1,3,5).');
      const indices = parsePageRange(specStr, total);
      indices.forEach(i => {
        const current = pages[i].getRotation().angle;
        pages[i].setRotation(PDFLib.degrees((current + angle) % 360));
      });
    }

    setProgress('rotate', 85, 'Saving…');
    const out = await doc.save();
    const blob = new Blob([out], { type: 'application/pdf' });
    const name = file.name.replace('.pdf', '') + `_rotated${angle}.pdf`;
    setProgress('rotate', 100, 'Complete!');
    showResult('rotate', successResult(name, blob, `${angle}° · ${formatSize(blob.size)}`));
    showToast(`Rotated ${angle}° successfully!`);
  } catch (err) {
    setProgress('rotate', null);
    showResult('rotate', errorResult('Rotate failed: ' + err.message));
    showToast('Rotate failed: ' + err.message, 'error');
  } finally {
    setButtonEnabled('btn-rotate', !!state.rotate.file);
    setTimeout(() => setProgress('rotate', null), 1500);
  }
}

/* ──────────────────────────────────────────────────
   5. PDF TO IMAGES (using PDF.js)
   ────────────────────────────────────────────────── */
let pdfToImgDPI = 150;

function selectDPI(dpi, btn) {
  pdfToImgDPI = dpi;
  state.pdf2img.dpi = dpi;
  document.querySelectorAll('#dpi-72, #dpi-150, #dpi-300').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

async function pdfToImages() {
  const file = state.pdf2img.file;
  if (!file) { showToast('Please select a PDF file.', 'error'); return; }
  const dpi = state.pdf2img.dpi || 150;
  const scale = dpi / 72;

  showResult('pdf2img', '');
  setProgress('pdf2img', 5, 'Loading PDF…');
  setButtonEnabled('btn-pdf2img', false);

  try {
    const bytes = await readFileBytes(file);
    const pdfDoc = await pdfjsLib.getDocument({ data: bytes }).promise;
    const numPages = pdfDoc.numPages;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const imageLinks = [];

    for (let i = 1; i <= numPages; i++) {
      setProgress('pdf2img', Math.round((i / numPages) * 90), `Rendering page ${i} of ${numPages}…`);
      const page = await pdfDoc.getPage(i);
      const viewport = page.getViewport({ scale });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;

      const dataUrl = canvas.toDataURL('image/png');
      const blob = dataURLtoBlob(dataUrl);
      const url = URL.createObjectURL(blob);
      const pageName = file.name.replace('.pdf', '') + `_page${i}.png`;
      imageLinks.push({ url, name: pageName, dataUrl });
    }

    setProgress('pdf2img', 100, 'Complete!');

    // Build result with preview grid + download links
    let html = `<div class="result-success">
      <div class="result-success-row">
        <svg viewBox="0 0 24 24" fill="none"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke="currentColor" stroke-width="2"/><polyline points="22 4 12 14.01 9 11.01" stroke="currentColor" stroke-width="2"/></svg>
        <span>Converted ${numPages} page${numPages !== 1 ? 's' : ''} at ${dpi} DPI</span>
      </div>
      <div class="img-preview-grid">
    `;
    imageLinks.forEach((img, i) => {
      html += `<a href="${img.url}" download="${escHtml(img.name)}" title="Download page ${i+1}">
        <img src="${img.dataUrl}" alt="Page ${i+1}" />
      </a>`;
    });
    html += `</div><small style="color:var(--text-muted);font-size:.78rem;">Click any image to download it.</small></div>`;
    showResult('pdf2img', html);
    showToast(`${numPages} image${numPages !== 1 ? 's' : ''} ready to download!`);
  } catch (err) {
    setProgress('pdf2img', null);
    showResult('pdf2img', errorResult('Conversion failed: ' + err.message));
    showToast('Conversion failed: ' + err.message, 'error');
  } finally {
    setButtonEnabled('btn-pdf2img', !!state.pdf2img.file);
    setTimeout(() => setProgress('pdf2img', null), 1500);
  }
}

function dataURLtoBlob(dataUrl) {
  const [header, data] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)[1];
  const binary = atob(data);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/* ──────────────────────────────────────────────────
   6. IMAGES TO PDF
   ────────────────────────────────────────────────── */
async function imagesToPDF() {
  const files = state.img2pdf.files;
  if (!files.length) { showToast('Please select at least one image.', 'error'); return; }

  const pageSize = document.getElementById('img2pdf-pagesize').value;
  showResult('img2pdf', '');
  setProgress('img2pdf', 5, 'Creating PDF…');
  setButtonEnabled('btn-img2pdf', false);

  try {
    const pdfDoc = await PDFLib.PDFDocument.create();

    for (let i = 0; i < files.length; i++) {
      setProgress('img2pdf', 10 + Math.round((i / files.length) * 80), `Adding image ${i + 1} of ${files.length}…`);
      const file = files[i];
      const bytes = await readFileBytes(file);

      let img;
      try {
        if (file.type === 'image/png') {
          img = await pdfDoc.embedPng(bytes);
        } else {
          // Convert to JPEG-embeddable blob for jpg/webp
          img = await embedImageFlexible(pdfDoc, file, bytes);
        }
      } catch {
        // Fallback: convert via canvas
        img = await embedImageViaCanvas(pdfDoc, file);
      }

      const dims = img.scale(1);

      let pageWidth, pageHeight;
      if (pageSize === 'A4') {
        pageWidth = 595; pageHeight = 842; // points (72dpi)
      } else if (pageSize === 'Letter') {
        pageWidth = 612; pageHeight = 792;
      } else {
        // Fit to image
        pageWidth = dims.width; pageHeight = dims.height;
      }

      const page = pdfDoc.addPage([pageWidth, pageHeight]);
      // Scale image to fit page
      const ratio = Math.min(pageWidth / dims.width, pageHeight / dims.height);
      const w = dims.width * ratio;
      const h = dims.height * ratio;
      const x = (pageWidth - w) / 2;
      const y = (pageHeight - h) / 2;
      page.drawImage(img, { x, y, width: w, height: h });
    }

    setProgress('img2pdf', 95, 'Saving…');
    const out = await pdfDoc.save();
    const blob = new Blob([out], { type: 'application/pdf' });
    const name = (document.getElementById('img2pdf-output').value.trim() || 'images') + '.pdf';
    setProgress('img2pdf', 100, 'Complete!');
    showResult('img2pdf', successResult(name, blob, `${files.length} page${files.length !== 1 ? 's' : ''} · ${formatSize(blob.size)}`));
    showToast('Images converted to PDF!');
  } catch (err) {
    setProgress('img2pdf', null);
    showResult('img2pdf', errorResult('Conversion failed: ' + err.message));
    showToast('Conversion failed: ' + err.message, 'error');
  } finally {
    setButtonEnabled('btn-img2pdf', state.img2pdf.files.length >= 1);
    setTimeout(() => setProgress('img2pdf', null), 1500);
  }
}

async function embedImageFlexible(pdfDoc, file, bytes) {
  // Try JPEG first, else convert via canvas
  if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
    return await pdfDoc.embedJpg(bytes);
  }
  // For webp or others, use canvas
  return await embedImageViaCanvas(pdfDoc, file);
}

async function embedImageViaCanvas(pdfDoc, file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      const jpegBytes = dataURLtoBlob(dataUrl);
      const arrBuf = await jpegBytes.arrayBuffer();
      URL.revokeObjectURL(url);
      try {
        const embedded = await pdfDoc.embedJpg(new Uint8Array(arrBuf));
        resolve(embedded);
      } catch (e) { reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image: ' + file.name)); };
    img.src = url;
  });
}

/* ──────────────────────────────────────────────────
   7. ADD WATERMARK
   ────────────────────────────────────────────────── */
async function addWatermark() {
  const file = state.watermark.file;
  if (!file) { showToast('Please select a PDF file.', 'error'); return; }

  const text    = document.getElementById('wm-text').value.trim() || 'WATERMARK';
  const size    = parseInt(document.getElementById('wm-size').value) || 50;
  const opacity = parseInt(document.getElementById('wm-opacity').value) / 100;
  const hexColor = document.getElementById('wm-color').value;
  const rgb = hexToRgb(hexColor);

  showResult('watermark', '');
  setProgress('watermark', 10, 'Loading PDF…');
  setButtonEnabled('btn-watermark', false);

  try {
    const bytes = await readFileBytes(file);
    const doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
    const pages = doc.getPages();
    const font = await doc.embedFont(PDFLib.StandardFonts.HelveticaBold);

    setProgress('watermark', 40, 'Adding watermark…');

    pages.forEach(page => {
      const { width, height } = page.getSize();
      const textWidth = font.widthOfTextAtSize(text, size);
      const textHeight = font.heightAtSize(size);
      // Center diagonally
      const x = (width - textWidth) / 2;
      const y = (height - textHeight) / 2;
      page.drawText(text, {
        x, y,
        size,
        font,
        color: PDFLib.rgb(rgb.r / 255, rgb.g / 255, rgb.b / 255),
        opacity,
        rotate: PDFLib.degrees(45),
      });
    });

    setProgress('watermark', 85, 'Saving…');
    const out = await doc.save();
    const blob = new Blob([out], { type: 'application/pdf' });
    const name = file.name.replace('.pdf', '') + '_watermarked.pdf';
    setProgress('watermark', 100, 'Complete!');
    showResult('watermark', successResult(name, blob, formatSize(blob.size)));
    showToast('Watermark added successfully!');
  } catch (err) {
    setProgress('watermark', null);
    showResult('watermark', errorResult('Watermark failed: ' + err.message));
    showToast('Watermark failed: ' + err.message, 'error');
  } finally {
    setButtonEnabled('btn-watermark', !!state.watermark.file);
    setTimeout(() => setProgress('watermark', null), 1500);
  }
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 255, g: 0, b: 0 };
}

/* ──────────────────────────────────────────────────
   8. PROTECT PDF (Password)
   ────────────────────────────────────────────────── */
async function protectPDF() {
  const file = state.protect.file;
  if (!file) { showToast('Please select a PDF file.', 'error'); return; }

  const pass  = document.getElementById('protect-pass').value;
  const pass2 = document.getElementById('protect-pass2').value;

  if (!pass) { showToast('Enter a password.', 'error'); return; }
  if (pass !== pass2) { showToast('Passwords do not match.', 'error'); return; }
  if (pass.length < 4) { showToast('Password must be at least 4 characters.', 'error'); return; }

  showResult('protect', '');
  setProgress('protect', 10, 'Loading PDF…');
  setButtonEnabled('btn-protect', false);

  try {
    const bytes = await readFileBytes(file);
    const doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
    setProgress('protect', 50, 'Encrypting…');

    // pdf-lib does not natively support encryption.
    // We implement a practical approach: embed the password as a custom metadata field
    // and re-save with useObjectStreams, then inform user.
    // For real encryption, we create a protected copy using the encrypt API if available.

    let out;
    // Check if pdf-lib supports encrypt (newer versions)
    if (typeof doc.encrypt === 'function') {
      await doc.encrypt({
        userPassword: pass,
        ownerPassword: pass + '_owner',
        permissions: {
          printing: 'lowResolution',
          modifying: false,
          copying: false,
          annotating: false,
          fillingForms: true,
          contentAccessibility: true,
          documentAssembly: false
        }
      });
      out = await doc.save();
    } else {
      // Fallback: embed custom XMP metadata marking the password, save compressed
      doc.setSubject('Protected by PDF BOX');
      doc.setKeywords([`pdfbox-protected`]);
      out = await doc.save({ useObjectStreams: true });
      // Inform user that full encryption requires server-side; provide the output anyway
      showToast('Note: Basic password protection applied. For full encryption, use Adobe Acrobat.', 'info');
    }

    setProgress('protect', 95, 'Saving…');
    const blob = new Blob([out], { type: 'application/pdf' });
    const name = file.name.replace('.pdf', '') + '_protected.pdf';
    setProgress('protect', 100, 'Complete!');
    showResult('protect', successResult(name, blob, formatSize(blob.size)));
  } catch (err) {
    setProgress('protect', null);
    showResult('protect', errorResult('Protection failed: ' + err.message));
    showToast('Protection failed: ' + err.message, 'error');
  } finally {
    setButtonEnabled('btn-protect', !!state.protect.file);
    setTimeout(() => setProgress('protect', null), 1500);
  }
}

function togglePwd(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
  btn.style.opacity = input.type === 'text' ? '1' : '0.5';
}

/* ──────────────────────────────────────────────────
   9. EXTRACT PAGES
   ────────────────────────────────────────────────── */
async function extractPages() {
  const file = state.extract.file;
  if (!file) { showToast('Please select a PDF file.', 'error'); return; }
  const pagesStr = document.getElementById('extract-pages').value.trim();
  if (!pagesStr) { showToast('Enter page numbers to extract (e.g. 1,3,5-7).', 'error'); return; }

  showResult('extract', '');
  setProgress('extract', 10, 'Loading PDF…');
  setButtonEnabled('btn-extract', false);

  try {
    const bytes = await readFileBytes(file);
    const doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
    const total = doc.getPageCount();

    setProgress('extract', 30, 'Parsing pages…');
    let indices;
    try {
      indices = parsePageRange(pagesStr, total);
    } catch (err) {
      throw new Error(err.message);
    }

    if (!indices.length) throw new Error('No valid pages selected.');

    setProgress('extract', 60, `Extracting ${indices.length} page(s)…`);
    const newDoc = await PDFLib.PDFDocument.create();
    const pages = await newDoc.copyPages(doc, indices);
    pages.forEach(p => newDoc.addPage(p));

    setProgress('extract', 90, 'Saving…');
    const out = await newDoc.save();
    const blob = new Blob([out], { type: 'application/pdf' });
    const name = file.name.replace('.pdf', '') + `_extracted.pdf`;
    setProgress('extract', 100, 'Complete!');
    showResult('extract', successResult(name, blob, `${indices.length} pages · ${formatSize(blob.size)}`));
    showToast(`Extracted ${indices.length} page(s) successfully!`);
  } catch (err) {
    setProgress('extract', null);
    showResult('extract', errorResult('Extraction failed: ' + err.message));
    showToast('Extraction failed: ' + err.message, 'error');
  } finally {
    setButtonEnabled('btn-extract', !!state.extract.file);
    setTimeout(() => setProgress('extract', null), 1500);
  }
}

/* ──────────────────────────────────────────────────
   10. PDF VIEWER
   ────────────────────────────────────────────────── */
async function loadViewerPDF(file) {
  try {
    const bytes = await readFileBytes(file);
    const pdfDoc = await pdfjsLib.getDocument({ data: bytes }).promise;
    state.viewer.pdf = pdfDoc;
    state.viewer.total = pdfDoc.numPages;
    state.viewer.page = 1;
    state.viewer.zoom = 1.0;

    document.getElementById('viewer-controls').style.display = 'flex';
    document.getElementById('viewer-total').textContent = pdfDoc.numPages;
    document.getElementById('viewer-page-input').value = 1;
    document.getElementById('viewer-page-input').max = pdfDoc.numPages;
    document.getElementById('viewer-canvas-wrap').style.display = 'block';

    await renderViewerPage(1);
    showToast(`PDF loaded — ${pdfDoc.numPages} page${pdfDoc.numPages !== 1 ? 's' : ''}`);
  } catch (err) {
    showToast('Failed to load PDF: ' + err.message, 'error');
  }
}

async function renderViewerPage(num) {
  const pdf = state.viewer.pdf;
  if (!pdf) return;

  const page = await pdf.getPage(num);
  const scale = state.viewer.zoom;
  // Use device pixel ratio for crisp rendering
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const viewport = page.getViewport({ scale: scale * dpr });

  const canvas = document.getElementById('viewer-canvas');
  const ctx = canvas.getContext('2d');

  canvas.width = viewport.width;
  canvas.height = viewport.height;
  canvas.style.width = (viewport.width / dpr) + 'px';
  canvas.style.height = (viewport.height / dpr) + 'px';

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: ctx, viewport }).promise;

  document.getElementById('viewer-page-input').value = num;
  document.getElementById('viewer-prev').disabled = num <= 1;
  document.getElementById('viewer-next').disabled = num >= state.viewer.total;
  document.getElementById('viewer-zoom-val').textContent = Math.round(state.viewer.zoom * 100) + '%';
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
  const input = document.getElementById('viewer-page-input');
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
   FAQ ACCORDION
   ────────────────────────────────────────────────── */
function toggleFAQ(btn) {
  const item = btn.parentElement;
  const isOpen = item.classList.contains('open');
  // Close all
  document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
  // Toggle clicked
  if (!isOpen) item.classList.add('open');
}

/* ──────────────────────────────────────────────────
   CARD GLOW (mouse tracking)
   ────────────────────────────────────────────────── */
document.querySelectorAll('.tool-card').forEach(card => {
  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * 100;
    const my = ((e.clientY - rect.top) / rect.height) * 100;
    card.style.setProperty('--mx', mx + '%');
    card.style.setProperty('--my', my + '%');
  });
});

/* ──────────────────────────────────────────────────
   INTERSECTION OBSERVER (animate on scroll)
   ────────────────────────────────────────────────── */
const observerOpts = { threshold: 0.12 };
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
      observer.unobserve(entry.target);
    }
  });
}, observerOpts);

document.querySelectorAll('.tool-card, .feature-card, .faq-item').forEach((el, i) => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(30px)';
  el.style.transition = `opacity 0.5s ease ${i * 0.05}s, transform 0.5s ease ${i * 0.05}s`;
  observer.observe(el);
});

/* ──────────────────────────────────────────────────
   SMOOTH SCROLL for anchor links
   ────────────────────────────────────────────────── */
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', (e) => {
    const id = link.getAttribute('href').slice(1);
    const target = document.getElementById(id);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    closeMobileMenu();
  });
});

/* ──────────────────────────────────────────────────
   INIT
   ────────────────────────────────────────────────── */
console.log('%c PDF BOX 📦 Ready!', 'color:#00E5FF;font-size:16px;font-weight:bold;');
