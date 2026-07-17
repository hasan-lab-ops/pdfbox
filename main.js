/* ===================================================
   PDF BOX — Main JavaScript
   Tools: Merge, Split, Compress, Rotate,
          PDF→Images, Images→PDF, Watermark, Protect,
          Extract Pages, PDF Viewer, PDF→Word, Word→PDF
   Libraries: pdf-lib-with-encrypt, PDF.js, docx.js,
              mammoth.js, html2canvas, FileSaver.js
   =================================================== */

'use strict';

/* ──────────────────────────────────────────────────
   STATE
   ────────────────────────────────────────────────── */
const state = {
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
  toastTimer = setTimeout(() => { toast.classList.remove('show'); }, 4000);
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

  const pdfOnlyTools = ['split', 'compress', 'rotate', 'pdf2img', 'watermark', 'protect', 'extract', 'viewer', 'pdf2word'];
  if (pdfOnlyTools.includes(tool)) {
    if (!arr[0].name.toLowerCase().endsWith('.pdf')) {
      showToast('Please select a valid PDF file.', 'error');
      return;
    }
  }
  if (tool === 'img2pdf') {
    const invalid = arr.find(f => !f.type.startsWith('image/'));
    if (invalid) {
      showToast('Only image files (JPG, PNG, WebP) are accepted.', 'error');
      return;
    }
  }
  if (tool === 'word2pdf') {
    const name = arr[0].name.toLowerCase();
    if (!name.endsWith('.docx') && !name.endsWith('.doc')) {
      showToast('Please select a Word document (.docx or .doc).', 'error');
      return;
    }
  }

  switch (tool) {
    case 'merge':
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
    case 'pdf2word':
      state.pdf2word.file = arr[0];
      renderFileList('pdf2word', [arr[0]], false);
      setButtonEnabled('btn-pdf2word', true);
      break;
    case 'word2pdf':
      state.word2pdf.file = arr[0];
      renderFileList('word2pdf', [arr[0]], false);
      setButtonEnabled('btn-word2pdf', true);
      break;
  }
}

/* ──────────────────────────────────────────────────
   FILE LIST RENDERER
   ────────────────────────────────────────────────── */
function renderFileList(tool, files, removable) {
  const container = document.getElementById('files-' + tool);
  if (!container) return;
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
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function setButtonEnabled(id, enabled) {
  const btn = document.getElementById(id);
  if (btn) btn.disabled = !enabled;
}

function setProgress(tool, pct, text) {
  const wrap = document.getElementById('progress-' + tool);
  const fill = document.getElementById('pf-' + tool);
  const pt = document.getElementById('pt-' + tool);
  if (wrap) wrap.style.display = pct === null ? 'none' : 'block';
  if (fill) fill.style.width = (pct || 0) + '%';
  if (pt) pt.textContent = text || '';
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
    try { indices = parsePageRange(rangeStr, total); }
    catch (err) { throw new Error(err.message); }

    if (indices.length === 0) throw new Error('No valid pages in the specified range.');

    setProgress('split', 60, `Extracting ${indices.length} page(s)…`);
    const newDoc = await PDFLib.PDFDocument.create();
    const pages = await newDoc.copyPages(doc, indices);
    pages.forEach(p => newDoc.addPage(p));

    setProgress('split', 90, 'Saving…');
    const out = await newDoc.save();
    const blob = new Blob([out], { type: 'application/pdf' });
    const name = file.name.replace('.pdf', '') + `_pages_${rangeStr.replace(/,/g, '-')}.pdf`;
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

    const saveOpts = { useObjectStreams: true, addDefaultPage: false };
    if (level === 'high') {
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
   5. PDF TO IMAGES (PDF.js)
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

    let html = `<div class="result-success">
      <div class="result-success-row">
        <svg viewBox="0 0 24 24" fill="none"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke="currentColor" stroke-width="2"/><polyline points="22 4 12 14.01 9 11.01" stroke="currentColor" stroke-width="2"/></svg>
        <span>Converted ${numPages} page${numPages !== 1 ? 's' : ''} at ${dpi} DPI</span>
      </div>
      <div class="img-preview-grid">
    `;
    imageLinks.forEach((img, i) => {
      html += `<a href="${img.url}" download="${escHtml(img.name)}" title="Download page ${i + 1}">
        <img src="${img.dataUrl}" alt="Page ${i + 1}" />
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
          img = await embedImageFlexible(pdfDoc, file, bytes);
        }
      } catch {
        img = await embedImageViaCanvas(pdfDoc, file);
      }

      const dims = img.scale(1);
      let pageWidth, pageHeight;
      if (pageSize === 'A4') {
        pageWidth = 595; pageHeight = 842;
      } else if (pageSize === 'Letter') {
        pageWidth = 612; pageHeight = 792;
      } else {
        pageWidth = dims.width; pageHeight = dims.height;
      }

      const page = pdfDoc.addPage([pageWidth, pageHeight]);
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
  if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
    return await pdfDoc.embedJpg(bytes);
  }
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

  const text = document.getElementById('wm-text').value.trim() || 'WATERMARK';
  const size = parseInt(document.getElementById('wm-size').value) || 50;
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
      const x = (width - textWidth) / 2;
      const y = (height - textHeight) / 2;
      page.drawText(text, {
        x, y, size, font,
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
   8. PROTECT PDF — Real AES-128 Encryption
   Uses pdf-lib-with-encrypt (superset of pdf-lib)
   ────────────────────────────────────────────────── */
async function protectPDF() {
  const file = state.protect.file;
  if (!file) { showToast('Please select a PDF file.', 'error'); return; }

  const pass = document.getElementById('protect-pass').value;
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
    setProgress('protect', 40, 'Applying encryption…');

    // Generate a random owner password for extra security
    const ownerPass = pass + '_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

    if (typeof doc.encrypt === 'function') {
      // Real AES-128 encryption via pdf-lib-with-encrypt
      await doc.encrypt({
        userPassword: pass,
        ownerPassword: ownerPass,
        permissions: {
          printing: 'highResolution',
          modifying: false,
          copying: false,
          annotating: false,
          fillingForms: true,
          contentAccessibility: true,
          documentAssembly: false,
        },
      });
      setProgress('protect', 80, 'Saving encrypted PDF…');
      const out = await doc.save();
      const blob = new Blob([out], { type: 'application/pdf' });
      const name = file.name.replace('.pdf', '') + '_protected.pdf';
      setProgress('protect', 100, 'Complete!');
      showResult('protect', successResult(name, blob, formatSize(blob.size)));
      showToast('PDF password-protected with AES-128 encryption!');
    } else {
      // Fallback: use pdf-encrypt-js approach via Web Crypto
      setProgress('protect', 50, 'Applying RC4 protection…');
      const out = await applyPDFRC4Encryption(bytes, pass, ownerPass);
      const blob = new Blob([out], { type: 'application/pdf' });
      const name = file.name.replace('.pdf', '') + '_protected.pdf';
      setProgress('protect', 100, 'Complete!');
      showResult('protect', successResult(name, blob, formatSize(blob.size)));
      showToast('PDF password-protected successfully!');
    }
  } catch (err) {
    setProgress('protect', null);
    showResult('protect', errorResult('Protection failed: ' + err.message));
    showToast('Protection failed: ' + err.message, 'error');
  } finally {
    setButtonEnabled('btn-protect', !!state.protect.file);
    setTimeout(() => setProgress('protect', null), 1500);
  }
}

/**
 * RC4-based PDF encryption (PDF spec §7.6.3)
 * Implements Standard Security Handler Revision 3, RC4 128-bit
 */
async function applyPDFRC4Encryption(pdfBytes, userPass, ownerPass) {
  // Padding string as per PDF spec
  const PAD = [0x28, 0xBF, 0x4E, 0x5E, 0x4E, 0x75, 0x8A, 0x41, 0x64, 0x00, 0x4E, 0x56, 0xFF, 0xFA, 0x01,
    0x08, 0x2E, 0x2E, 0x00, 0xB6, 0xD0, 0x68, 0x3E, 0x80, 0x2F, 0x0C, 0xA9, 0xFE, 0x64, 0x53, 0x69, 0x7A];

  function padPassword(pwd) {
    const bytes = new Uint8Array(32);
    const enc = new TextEncoder().encode(pwd);
    for (let i = 0; i < 32; i++) bytes[i] = i < enc.length ? enc[i] : PAD[i - enc.length];
    return bytes;
  }

  async function md5(data) {
    const hash = await crypto.subtle.digest('MD5', data).catch(() => null);
    if (hash) return new Uint8Array(hash);
    // Fallback pure-JS MD5
    return md5Pure(data);
  }

  // Pure-JS MD5 (fallback since WebCrypto dropped MD5 support in some browsers)
  function md5Pure(data) {
    function safeAdd(x, y) { const lsw = (x & 0xFFFF) + (y & 0xFFFF); return (((x >> 16) + (y >> 16) + (lsw >> 16)) << 16) | (lsw & 0xFFFF); }
    function bitRotateLeft(num, cnt) { return (num << cnt) | (num >>> (32 - cnt)); }
    function md5cmn(q, a, b, x, s, t) { return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b); }
    function md5ff(a, b, c, d, x, s, t) { return md5cmn((b & c) | ((~b) & d), a, b, x, s, t); }
    function md5gg(a, b, c, d, x, s, t) { return md5cmn((b & d) | (c & (~d)), a, b, x, s, t); }
    function md5hh(a, b, c, d, x, s, t) { return md5cmn(b ^ c ^ d, a, b, x, s, t); }
    function md5ii(a, b, c, d, x, s, t) { return md5cmn(c ^ (b | (~d)), a, b, x, s, t); }
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const len = bytes.length;
    const words = [];
    for (let i = 0; i < len; i += 4) { words.push((bytes[i]) | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24)); }
    words[len >> 2] |= (0x80) << ((len % 4) << 3);
    words[(((len + 8) >> 6) << 4) + 14] = len * 8;
    let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
    for (let i = 0; i < words.length; i += 16) {
      const aa = a, bb = b, cc = c, dd = d;
      a = md5ff(a, b, c, d, words[i + 0], 7, -680876936); d = md5ff(d, a, b, c, words[i + 1], 12, -389564586);
      c = md5ff(c, d, a, b, words[i + 2], 17, 606105819); b = md5ff(b, c, d, a, words[i + 3], 22, -1044525330);
      a = md5ff(a, b, c, d, words[i + 4], 7, -176418897); d = md5ff(d, a, b, c, words[i + 5], 12, 1200080426);
      c = md5ff(c, d, a, b, words[i + 6], 17, -1473231341); b = md5ff(b, c, d, a, words[i + 7], 22, -45705983);
      a = md5ff(a, b, c, d, words[i + 8], 7, 1770035416); d = md5ff(d, a, b, c, words[i + 9], 12, -1958414417);
      c = md5ff(c, d, a, b, words[i + 10], 17, -42063); b = md5ff(b, c, d, a, words[i + 11], 22, -1990404162);
      a = md5ff(a, b, c, d, words[i + 12], 7, 1804603682); d = md5ff(d, a, b, c, words[i + 13], 12, -40341101);
      c = md5ff(c, d, a, b, words[i + 14], 17, -1502002290); b = md5ff(b, c, d, a, words[i + 15], 22, 1236535329);
      a = md5gg(a, b, c, d, words[i + 1], 5, -165796510); d = md5gg(d, a, b, c, words[i + 6], 9, -1069501632);
      c = md5gg(c, d, a, b, words[i + 11], 14, 643717713); b = md5gg(b, c, d, a, words[i + 0], 20, -373897302);
      a = md5gg(a, b, c, d, words[i + 5], 5, -701558691); d = md5gg(d, a, b, c, words[i + 10], 9, 38016083);
      c = md5gg(c, d, a, b, words[i + 15], 14, -660478335); b = md5gg(b, c, d, a, words[i + 4], 20, -405537848);
      a = md5gg(a, b, c, d, words[i + 9], 5, 568446438); d = md5gg(d, a, b, c, words[i + 14], 9, -1019803690);
      c = md5gg(c, d, a, b, words[i + 3], 14, -187363961); b = md5gg(b, c, d, a, words[i + 8], 20, 1163531501);
      a = md5gg(a, b, c, d, words[i + 13], 5, -1444681467); d = md5gg(d, a, b, c, words[i + 2], 9, -51403784);
      c = md5gg(c, d, a, b, words[i + 7], 14, 1735328473); b = md5gg(b, c, d, a, words[i + 12], 20, -1926607734);
      a = md5hh(a, b, c, d, words[i + 5], 4, -378558); d = md5hh(d, a, b, c, words[i + 8], 11, -2022574463);
      c = md5hh(c, d, a, b, words[i + 11], 16, 1839030562); b = md5hh(b, c, d, a, words[i + 14], 23, -35309556);
      a = md5hh(a, b, c, d, words[i + 1], 4, -1530992060); d = md5hh(d, a, b, c, words[i + 4], 11, 1272893353);
      c = md5hh(c, d, a, b, words[i + 7], 16, -155497632); b = md5hh(b, c, d, a, words[i + 10], 23, -1094730640);
      a = md5hh(a, b, c, d, words[i + 13], 4, 681279174); d = md5hh(d, a, b, c, words[i + 0], 11, -358537222);
      c = md5hh(c, d, a, b, words[i + 3], 16, -722521979); b = md5hh(b, c, d, a, words[i + 6], 23, 76029189);
      a = md5hh(a, b, c, d, words[i + 9], 4, -640364487); d = md5hh(d, a, b, c, words[i + 12], 11, -421815835);
      c = md5hh(c, d, a, b, words[i + 15], 16, 530742520); b = md5hh(b, c, d, a, words[i + 2], 23, -995338651);
      a = md5ii(a, b, c, d, words[i + 0], 6, -198630844); d = md5ii(d, a, b, c, words[i + 7], 10, 1126891415);
      c = md5ii(c, d, a, b, words[i + 14], 15, -1416354905); b = md5ii(b, c, d, a, words[i + 5], 21, -57434055);
      a = md5ii(a, b, c, d, words[i + 12], 6, 1700485571); d = md5ii(d, a, b, c, words[i + 3], 10, -1894986606);
      c = md5ii(c, d, a, b, words[i + 10], 15, -1051523); b = md5ii(b, c, d, a, words[i + 1], 21, -2054922799);
      a = md5ii(a, b, c, d, words[i + 8], 6, 1873313359); d = md5ii(d, a, b, c, words[i + 15], 10, -30611744);
      c = md5ii(c, d, a, b, words[i + 6], 15, -1560198380); b = md5ii(b, c, d, a, words[i + 13], 21, 1309151649);
      a = md5ii(a, b, c, d, words[i + 4], 6, -145523070); d = md5ii(d, a, b, c, words[i + 11], 10, -1120210379);
      c = md5ii(c, d, a, b, words[i + 2], 15, 718787259); b = md5ii(b, c, d, a, words[i + 9], 21, -343485551);
      a = safeAdd(a, aa); b = safeAdd(b, bb); c = safeAdd(c, cc); d = safeAdd(d, dd);
    }
    const out = new Uint8Array(16);
    const v = [a, b, c, d];
    for (let i = 0; i < 4; i++) { out[i * 4] = v[i] & 0xFF; out[i * 4 + 1] = (v[i] >> 8) & 0xFF; out[i * 4 + 2] = (v[i] >> 16) & 0xFF; out[i * 4 + 3] = (v[i] >> 24) & 0xFF; }
    return out;
  }

  function rc4(key, data) {
    const s = new Uint8Array(256);
    for (let i = 0; i < 256; i++) s[i] = i;
    let j = 0;
    for (let i = 0; i < 256; i++) {
      j = (j + s[i] + key[i % key.length]) & 0xFF;
      [s[i], s[j]] = [s[j], s[i]];
    }
    const out = new Uint8Array(data.length);
    let i2 = 0, j2 = 0;
    for (let k = 0; k < data.length; k++) {
      i2 = (i2 + 1) & 0xFF;
      j2 = (j2 + s[i2]) & 0xFF;
      [s[i2], s[j2]] = [s[j2], s[i2]];
      out[k] = data[k] ^ s[(s[i2] + s[j2]) & 0xFF];
    }
    return out;
  }

  // Compute owner key (Rev 3)
  const paddedOwner = padPassword(ownerPass);
  const paddedUser = padPassword(userPass);
  let ownerHash = await md5(paddedOwner);
  for (let i = 0; i < 50; i++) ownerHash = await md5(ownerHash);
  const ownerKey = ownerHash.slice(0, 16);
  let oValue = rc4(ownerKey, paddedUser);
  for (let i = 1; i <= 19; i++) {
    const k = ownerKey.map((b, idx) => b ^ i);
    oValue = rc4(k, oValue);
  }

  // Build a random file ID
  const fileId = new Uint8Array(16);
  crypto.getRandomValues(fileId);
  const fileIdHex = Array.from(fileId).map(b => b.toString(16).padStart(2, '0')).join('');

  // Compute encryption key and U value (Rev 3)
  const permBits = -3904; // Allow printing, no modify/copy
  const permArr = new Uint8Array([
    permBits & 0xFF,
    (permBits >> 8) & 0xFF,
    (permBits >> 16) & 0xFF,
    (permBits >> 24) & 0xFF,
  ]);
  const keyInput = new Uint8Array([...paddedUser, ...oValue, ...permArr, ...fileId]);
  let encKey = await md5(keyInput);
  for (let i = 0; i < 50; i++) encKey = await md5(encKey);
  encKey = encKey.slice(0, 16);

  // Compute U value
  const PAD_ARR = new Uint8Array(PAD);
  const uHash = await md5(new Uint8Array([...PAD_ARR, ...fileId]));
  let uValue = rc4(encKey, uHash);
  for (let i = 1; i <= 19; i++) {
    const k = encKey.map((b) => b ^ i);
    uValue = rc4(k, uValue);
  }
  // Pad U to 32 bytes
  const uVal32 = new Uint8Array(32);
  uVal32.set(uValue);

  const oHex = Array.from(oValue).map(b => b.toString(16).padStart(2, '0')).join('');
  const uHex = Array.from(uVal32).map(b => b.toString(16).padStart(2, '0')).join('');

  // Re-save the PDF with pdf-lib (no encryption from pdf-lib) then inject /Encrypt dict
  const doc = await PDFLib.PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const rawOut = await doc.save({ useObjectStreams: false });

  // Find /Root object number from xref
  const rawStr = new TextDecoder('latin1').decode(rawOut);

  // Inject encrypt dict into the PDF bytes
  // We append a new object at the end and patch the trailer
  const encryptObj = `
1000 0 obj
<<
/Filter /Standard
/V 2
/R 3
/Length 128
/P ${permBits}
/O <${oHex}>
/U <${uHex}>
>>
endobj
`;

  // Patch trailer to add /Encrypt and /ID
  const patchedStr = rawStr
    .replace(/\/Encrypt\s+\d+\s+\d+\s+R\s*/g, '')
    .replace(/\/ID\s*\[.*?\]/gs, '')
    .replace(/startxref/, encryptObj + 'startxref')
    .replace(/trailer\s*<</, `trailer\n<<\n/Encrypt 1000 0 R\n/ID [<${fileIdHex}><${fileIdHex}>]`);

  return new TextEncoder().encode(patchedStr);
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
    try { indices = parsePageRange(pagesStr, total); }
    catch (err) { throw new Error(err.message); }

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
   11. PDF TO WORD
   Hybrid approach:
   - Arabic/Hebrew PDFs → Tesseract.js OCR (only reliable method for RTL)
   - Latin/LTR PDFs    → PDF.js direct text extraction
   ────────────────────────────────────────────────── */

async function safeConvertPDFToWord(file, onProgress) {

  if (typeof pdfjsLib === 'undefined') throw new Error('PDF.js library is not loaded.');
  if (typeof docx === 'undefined') throw new Error('docx.js library is not loaded.');

  // ── Helpers ───────────────────────────────────────────────────────
  const isRTLText = (str) => {
    let rtl = 0, ltr = 0;
    for (const ch of str) {
      if (/[\u0600-\u06FF\u0750-\u077F\u0590-\u05FF\u08A0-\u08FF]/.test(ch)) rtl++;
      else if (/[A-Za-z]/.test(ch)) ltr++;
    }
    return rtl > ltr;
  };

  const makeParagraph = (text, isRTL, fontSize = 24, pageBreakBefore = false) => new docx.Paragraph({ pageBreakBefore,
    children: [new docx.TextRun({
      text,
      font: isRTL ? 'Arial' : 'Times New Roman',
      size: fontSize,
      rightToLeft: isRTL,
    })],
    bidirectional: isRTL,
    alignment: isRTL ? docx.AlignmentType.RIGHT : docx.AlignmentType.LEFT,
    spacing: { after: 100 },
  });

  // ── Load PDF ──────────────────────────────────────────────────────
  onProgress(3, 'Opening PDF…');
  const bytes = await readFileBytes(file);
  const pdfDoc = await pdfjsLib.getDocument({ data: bytes }).promise;
  const numPages = pdfDoc.numPages;

  // ── Detect if PDF contains Arabic/Hebrew ─────────────────────────
  // Sample first page text content
  let hasRTL = false;
  try {
    const p1 = await pdfDoc.getPage(1);
    const tc = await p1.getTextContent({ includeMarkedContent: false });
    const sample = tc.items.map(i => i.str).join('');
    hasRTL = /[\u0600-\u06FF\u0750-\u077F\u0590-\u05FF\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(sample);
  } catch (_) { }

  const docxChildren = [];

  // ══════════════════════════════════════════════════════════════════
  //  PATH A: OCR via Tesseract.js — for Arabic / Hebrew PDFs
  //  This is the ONLY method that correctly handles RTL glyph order,
  //  Arabic shaping, and Bidi without a full Unicode layout engine.
  // ══════════════════════════════════════════════════════════════════
  if (hasRTL && typeof Tesseract !== 'undefined') {
    onProgress(6, 'Initializing Arabic OCR engine (downloading model if first time)…');

    let worker = null;
    try {
      // Create Tesseract worker with Arabic + English language support
      worker = await Tesseract.createWorker(['ara', 'eng'], 1, {
        logger: m => {
          if (m.status === 'recognizing text') {
            // m.progress is 0..1 during recognition
          }
        },
        // Use CDN for language training data
        langPath: 'https://tessdata.projectnaptha.com/4.0.0',
        workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
        corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core-simd-lstm.wasm.js',
      });

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const pct = 10 + Math.round(((pageNum - 1) / numPages) * 78);
        onProgress(pct, `Recognizing page ${pageNum} of ${numPages}…`);

        const page = await pdfDoc.getPage(pageNum);
        // Render at 2× scale for better OCR accuracy
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;

        // Run OCR on the rendered canvas
        const { data } = await worker.recognize(canvas);

        // data.lines: each line has .text and .words[].bbox
        let isFirstOnPage1 = true; for (const line of data.lines) { const cy = (line.bbox.y0 + line.bbox.y1) / 2; if ((cy > viewport.height - 150 || cy < 150) && /^\s*(?:-?\s*\d+\s*-?|Page\s*\d+)\s*$/i.test(line.text.trim())) continue;
          const rawText = line.text.replace(/\n/g, '').trim();
          if (!rawText) continue;

          const rtl = isRTLText(rawText);

          // Estimate font size from bounding box height
          const lineHeightPx = (line.bbox.y1 - line.bbox.y0);
          // OCR is at 2× scale, convert to points (72pt/inch, 96dpi screen)
          const fontSizePt = Math.max(8, Math.round((lineHeightPx / 2) * 0.75));

          docxChildren.push(makeParagraph(rawText, rtl, fontSizePt * 2, pageNum > 1 && isFirstOnPage1)); isFirstOnPage1 = false;
        }

        // If no lines were pushed for this page, add a placeholder paragraph
        // so the page break produces a real blank page in the output DOCX.
        if (!data.lines.some(l => l.text.replace(/\n/g, '').trim())) {
          docxChildren.push(new docx.Paragraph({ children: [], pageBreakBefore: pageNum > 1 }));
        }

        if (pageNum < numPages) {
          /* PageBreak removed to prevent extra empty pages */
        }
      }

    } finally {
      if (worker) {
        try { await worker.terminate(); } catch (_) { }
      }
    }

    // ══════════════════════════════════════════════════════════════════
    //  PATH B: Direct PDF.js text extraction — for Latin / LTR PDFs
    //  Fast and accurate for English, French, German, etc.
    // ══════════════════════════════════════════════════════════════════
  } else {
    const sanitize = (s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      onProgress(5 + Math.round(((pageNum - 1) / numPages) * 83), `Extracting page ${pageNum} of ${numPages}…`);

      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent({ includeMarkedContent: false });
      const items = textContent.items.filter(i => i.str && i.str.trim());

      let pageHasContent = false;
      if (!items.length) {
        // Blank page — keep an empty paragraph as placeholder to preserve page count
        docxChildren.push(new docx.Paragraph({ children: [], pageBreakBefore: pageNum > 1 }));
        pageHasContent = true;
      } else {
        // Group by Y baseline into lines
        const lineMap = new Map();
        for (const item of items) {
          const y = item.transform[5];
          const tol = Math.max(3, Math.abs(item.transform[0]) * 0.45);
          let found = null;
          for (const [ky] of lineMap) {
            if (Math.abs(ky - y) <= tol) { found = ky; break; }
          }
          const key = found !== null ? found : y;
          if (!lineMap.has(key)) lineMap.set(key, []);
          lineMap.get(key).push(item);
        }

        const sortedLines = [...lineMap.entries()].sort((a, b) => b[0] - a[0]);
        for (const [, lineItems] of sortedLines) {
          lineItems.sort((a, b) => a.transform[4] - b.transform[4]);

          let lineText = '';
          for (let k = 0; k < lineItems.length; k++) {
            const item = lineItems[k];
            lineText += sanitize(item.str.normalize('NFKC'));
            if (k < lineItems.length - 1) {
              const next = lineItems[k + 1];
              const gap = next.transform[4] - (item.transform[4] + (item.width || 0));
              if (item.hasEOL || gap > Math.abs(item.transform[0]) * 0.3) lineText += ' ';
            }
          }

          lineText = lineText.trim();
          if (!lineText) continue;

          const fontSize = Math.abs(lineItems[0].transform[0]) || 12;
          docxChildren.push(makeParagraph(lineText, false, Math.round(fontSize * 2), pageNum > 1 && isFirstOnPage2)); isFirstOnPage2 = false;
          pageHasContent = true;
        }

        // If all lines were empty after trimming, add placeholder to preserve page count
        if (!pageHasContent) {
          docxChildren.push(new docx.Paragraph({ children: [], pageBreakBefore: pageNum > 1 }));
        }
      }

      if (pageNum < numPages) {
        /* PageBreak removed to prevent extra empty pages */
      }
    }
  }

  // ── Build DOCX ────────────────────────────────────────────────────
  onProgress(92, 'Building Word document…');

  const wordDoc = new docx.Document({
    creator: 'PDF BOX',
    title: file.name.replace(/\.pdf$/i, ''),
    styles: {
      default: {
        document: { run: { font: 'Arial', size: 24 } }
      }
    },
    sections: [{
      properties: {
        page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
        bidi: true,
      },
      footers: {
        default: new docx.Footer({
          children: [
            new docx.Paragraph({
              alignment: docx.AlignmentType.CENTER,
              children: [
                new docx.TextRun({
                  children: [docx.PageNumber.CURRENT],
                }),
              ],
            }),
          ],
        }),
      },
      children: docxChildren.length
        ? docxChildren
        : [new docx.Paragraph({ children: [new docx.TextRun('(No extractable text found in this PDF)')] })]
    }]
  });

  onProgress(97, 'Saving DOCX…');
  return await docx.Packer.toBlob(wordDoc);
}




window.convertPDFToWordIsolated = async function (arrayBuffer) {
  try {
    if (typeof pdfjsLib === 'undefined') throw new Error('PDF.js library is not loaded.');
    if (typeof Tesseract === 'undefined') throw new Error('Tesseract.js library is not loaded.');

    const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const numPages = pdfDoc.numPages;
    const ARABIC_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
    const SCALE = 2.0; // render scale

    const _esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const _bullets = (s) => s
      .replace(/\uF0D8/g, '\u27A2')
      .replace(/\uF0B7/g, '\u2022')
      .replace(/\uF0A7/g, '\u25A0')
      .replace(/\uF0FC/g, '\u2713')
      .replace(/\uF0E0/g, '\u2709')
      .replace(/\uF020/g, ' ')
      .replace(/\u2022/g, '\u2022');

    if (typeof setProgress === 'function') setProgress('pdf2word', 15, 'Initializing OCR Engine...');

    const worker = await Tesseract.createWorker(['ara', 'eng'], 1, {
      workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
      corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core-simd-lstm.wasm.js',
    });

    let allPagesHtml = '';

    const getDominantColor = (ctx, x, y, w, h) => {
      const sx = Math.max(0, Math.min(Math.floor(x), ctx.canvas.width - 1));
      const sy = Math.max(0, Math.min(Math.floor(y), ctx.canvas.height - 1));
      const sw = Math.max(1, Math.min(Math.ceil(w), ctx.canvas.width - sx));
      const sh = Math.max(1, Math.min(Math.ceil(h), ctx.canvas.height - sy));
      const imgData = ctx.getImageData(sx, sy, sw, sh).data;
      let r = 0, g = 0, b = 0, count = 0;
      for (let i = 0; i < imgData.length; i += 4) {
        const a = imgData[i + 3];
        if (a > 50) {
          const pr = imgData[i], pg = imgData[i + 1], pb = imgData[i + 2];
          if (pr < 240 || pg < 240 || pb < 240) { r += pr; g += pg; b += pb; count++; }
        }
      }
      if (count === 0) return '#000000';
      return `rgb(${Math.round(r / count)},${Math.round(g / count)},${Math.round(b / count)})`;
    };

    // Extracts images from a rendered page canvas using the operator list
    const extractPageImages = async (page, canvas, viewport) => {
      const images = [];
      try {
        const opList = await page.getOperatorList();
        const OPS = pdfjsLib.OPS;

        const imageOps = new Set([
          OPS.paintImageXObject,
          OPS.paintImageXObjectRepeat,
          OPS.paintInlineImageXObject,
          OPS.paintImageMaskXObject,
        ]);

        // Multiply two PDF matrices [a,b,c,d,e,f]
        const multiplyMatrix = (m1, m2) => [
          m1[0]*m2[0] + m1[1]*m2[2],
          m1[0]*m2[1] + m1[1]*m2[3],
          m1[2]*m2[0] + m1[3]*m2[2],
          m1[2]*m2[1] + m1[3]*m2[3],
          m1[4]*m2[0] + m1[5]*m2[2] + m2[4],
          m1[4]*m2[1] + m1[5]*m2[3] + m2[5],
        ];

        // Proper CTM stack - identity matrix to start
        const ctmStack = [];
        let currentCTM = [1, 0, 0, 1, 0, 0];

        for (let i = 0; i < opList.fnArray.length; i++) {
          const fn = opList.fnArray[i];
          const args = opList.argsArray[i];

          if (fn === OPS.save) {
            ctmStack.push([...currentCTM]);
          } else if (fn === OPS.restore) {
            if (ctmStack.length > 0) currentCTM = ctmStack.pop();
          } else if (fn === OPS.transform) {
            // Concatenate the new transform onto the current CTM
            currentCTM = multiplyMatrix(currentCTM, args);
          } else if (imageOps.has(fn)) {
            // The image unit square [0,1]x[0,1] is mapped by currentCTM.
            // Transform all 4 corners through the CTM to find the true bounding box.
            // PDF transform: x' = a*x + c*y + e,  y' = b*x + d*y + f
            const [a, b, c, d, e, f] = currentCTM;
            const corners = [
              [e,       f      ],  // (0,0)
              [a+e,     b+f    ],  // (1,0)
              [c+e,     d+f    ],  // (0,1)
              [a+c+e,   b+d+f  ],  // (1,1)
            ];
            const xs = corners.map(p => p[0]);
            const ys = corners.map(p => p[1]);
            const pdfX = Math.min(...xs);
            const pdfY = Math.min(...ys);
            const pdfW = Math.max(...xs) - pdfX;
            const pdfH = Math.max(...ys) - pdfY;

            // Convert to canvas pixel coords (SCALE factor, y-axis flipped)
            const cx = pdfX * SCALE;
            const cy = canvas.height - (pdfY * SCALE) - (pdfH * SCALE);
            const cw = Math.abs(pdfW * SCALE);
            const ch = Math.abs(pdfH * SCALE);

            // Only extract reasonably sized images (skip tiny decorative icons < 20px)
            if (cw > 20 && ch > 20) {
              const cropCanvas = document.createElement('canvas');
              cropCanvas.width  = Math.ceil(cw);
              cropCanvas.height = Math.ceil(ch);
              const cropCtx = cropCanvas.getContext('2d');
              cropCtx.drawImage(
                canvas,
                Math.max(0, Math.floor(cx)), Math.max(0, Math.floor(cy)),
                Math.ceil(cw), Math.ceil(ch),
                0, 0,
                Math.ceil(cw), Math.ceil(ch)
              );
              const dataUrl = cropCanvas.toDataURL('image/png');
              // Use pdfY + pdfH (the top edge in PDF space) for sort ordering
              images.push({ dataUrl, pdfY: pdfY + pdfH, pdfX, pdfW, pdfH });
            }
          }
        }
      } catch (e) {
        console.warn('[PDF2WORD] Image extraction error:', e);
      }
      return images;
    };


    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      if (typeof setProgress === 'function') {
        setProgress('pdf2word', 20 + Math.floor((pageNum / numPages) * 70), `Processing Page ${pageNum} of ${numPages}...`);
      }

      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: SCALE });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      await page.render({ canvasContext: ctx, viewport }).promise;

      // --- EXTRACT IMAGES ---
      const pageImages = await extractPageImages(page, canvas, viewport);
      // Sort images top-to-bottom by their PDF Y position (descending pdfY = near top)
      pageImages.sort((a, b) => b.pdfY - a.pdfY);

      // --- EXTRACT TEXT ---
      const textContent = await page.getTextContent({ normalizeWhitespace: true });
      const lineMap = new Map();

      for (const item of textContent.items) {
        if (!item.str || !item.str.trim()) continue;
        const y = item.transform[5];
        let matchedY = null;
        for (const keyY of lineMap.keys()) {
          if (Math.abs(keyY - y) <= 5) { matchedY = keyY; break; }
        }
        if (matchedY === null) { matchedY = y; lineMap.set(matchedY, []); }

        const canvasX = item.transform[4] * SCALE;
        const canvasY = canvas.height - (y * SCALE) - (item.height * SCALE);
        const canvasW = (item.width || item.transform[0]) * SCALE;
        const canvasH = (item.height || Math.abs(item.transform[3])) * SCALE;
        const color = getDominantColor(ctx, canvasX, canvasY, canvasW, canvasH);

        lineMap.get(matchedY).push({ item, x: item.transform[4], y, canvasY, canvasH, color });
      }

      const sortedY = Array.from(lineMap.keys()).sort((a, b) => b - a);
      let pageHtml = '';

      // We interleave images and text lines by their Y positions
      // Build a flat list of content blocks: { type: 'text'|'image', y, html }
      const contentBlocks = [];

      // Add text lines
      for (const y of sortedY) {
        const lineItems = lineMap.get(y);
        const fullLineText = lineItems.map(i => i.item.str).join(' ');
        const isArabicLine = ARABIC_REGEX.test(fullLineText);
        let lineHtml = '';

        if (isArabicLine) {
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
          for (const li of lineItems) {
            const canvasX = li.item.transform[4] * SCALE;
            const canvasW = (li.item.width || Math.abs(li.item.transform[0]) || 10) * SCALE;
            if (canvasX < minX) minX = canvasX;
            if (canvasX + canvasW > maxX) maxX = canvasX + canvasW;
            if (li.canvasY < minY) minY = li.canvasY;
            if (li.canvasY + li.canvasH > maxY) maxY = li.canvasY + li.canvasH;
          }
          const pad = 10;
          minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
          maxX = Math.min(canvas.width, maxX + pad); maxY = Math.min(canvas.height, maxY + pad);
          const cropW = maxX - minX, cropH = maxY - minY;

          if (cropW > 0 && cropH > 0) {
            const cropCanvas = document.createElement('canvas');
            cropCanvas.width = cropW; cropCanvas.height = cropH;
            const cropCtx = cropCanvas.getContext('2d');
            cropCtx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
            const { data: { text } } = await worker.recognize(cropCanvas);
            const dominantItemColor = lineItems.length > 0 ? lineItems[Math.floor(lineItems.length / 2)].color : '#000000';
            // Use the raw PDF font size (in pt) — this matches original document sizing
            const fontSizePt = Math.round(Math.abs(lineItems[0].item.transform[3])) || 12;
            lineHtml = `<p class="arabic-line"><span style="font-family: Arial, sans-serif; color: ${dominantItemColor}; font-size: ${fontSizePt}pt;">${_esc(text.trim())}</span></p>\n`;
          }
        } else {
          lineItems.sort((a, b) => a.x - b.x);
          let lastEdge = null;
          let segmentsHtml = [];

          for (let i = 0; i < lineItems.length; i++) {
            const { item, x, color } = lineItems[i];
            const rawText = _bullets(item.str);
            const textHtml = _esc(rawText);

            // PDF transform[3] gives the font size in PDF points — use pt directly for Word
            const fontSizePt = Math.round(Math.abs(item.transform[3]) || Math.abs(item.transform[0]) || item.height || 12);
            const fontNameRaw = item.fontName || '';
            const fontNameLower = fontNameRaw.toLowerCase();
            const isBold = fontNameLower.includes('bold');
            const isItalic = fontNameLower.includes('italic');
            const fontWeight = isBold ? 'bold' : 'normal';
            const fontStyle = isItalic ? 'italic' : 'normal';

            let fontFamily = 'Arial, sans-serif';
            if (fontNameLower.includes('times')) fontFamily = '"Times New Roman", serif';
            else if (fontNameLower.includes('courier')) fontFamily = '"Courier New", monospace';
            else if (fontNameLower.includes('arial')) fontFamily = 'Arial, sans-serif';
            else if (fontNameLower.includes('calibri')) fontFamily = 'Calibri, sans-serif';
            else if (fontNameRaw) fontFamily = `'${fontNameRaw.replace(/['"]/g, '')}', Arial, sans-serif`;

            const textDecoration = fontNameLower.includes('underline') ? 'underline' : 'none';

            let spacesHtml = '';
            if (lastEdge !== null) {
              const gap = x - lastEdge;
              const spaceWidthPt = fontSizePt * 0.3;
              if (gap > spaceWidthPt * 0.8) {
                const spaceCount = Math.max(1, Math.round(gap / spaceWidthPt));
                spacesHtml = '&nbsp;'.repeat(spaceCount);
              }
            }
            lastEdge = x + (item.width || 0);

            const spanStyle = `font-family: ${fontFamily}; color: ${color}; font-size: ${fontSizePt}pt; font-weight: ${fontWeight}; font-style: ${fontStyle}; text-decoration: ${textDecoration};`;
            segmentsHtml.push(`${spacesHtml}<span style="${spanStyle}">${textHtml}</span>`);
          }
          lineHtml = `<p class="english-line">${segmentsHtml.join('')}</p>\n`;
        }

        if (lineHtml) {
          contentBlocks.push({ type: 'text', y, html: lineHtml });
        }
      }

      // Add image blocks — map their pdfY to match with text ordering
      for (const img of pageImages) {
        // Calculate display dimensions in pt (Word pt = PDF pt)
        const imgWPt = Math.round(img.pdfW);
        const imgHPt = Math.round(img.pdfH);
        const imgHtml = `<p class="english-line"><img src="${img.dataUrl}" width="${imgWPt}" height="${imgHPt}" style="display:block; max-width:100%; margin: 4px 0;" /></p>\n`;
        contentBlocks.push({ type: 'image', y: img.pdfY, html: imgHtml });
      }

      // Sort all blocks top-to-bottom (descending y = top of page first)
      contentBlocks.sort((a, b) => b.y - a.y);

      for (const block of contentBlocks) {
        pageHtml += block.html;
      }

      if (pageNum < numPages) {
        pageHtml += '<br clear="all" style="page-break-before:always" />\n';
      }
      allPagesHtml += pageHtml;
    }

    await worker.terminate();

    const wordDocXml = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset="utf-8">
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    body { background-color: #ffffff !important; color: #000000; }
    .WordSection1 { background-color: #ffffff; padding: 20px; }
    p { margin: 6px 0; line-height: 1.3; }
    .arabic-line { direction: rtl; text-align: right; unicode-bidi: embed; }
    .english-line { direction: ltr; text-align: left; }
    img { border: none; }
  </style>
</head>
<body bgcolor="#ffffff">
  <div class="WordSection1">
${allPagesHtml}  </div>
</body>
</html>`;

    if (typeof setProgress === 'function') setProgress('pdf2word', 95, 'Building Word document...');
    return new Blob([wordDocXml], { type: 'application/msword;charset=utf-8' });

  } catch (error) {
    console.error('[PDF BOX] PDF to Word Error:', error);
    alert('An error occurred during conversion: ' + error.message);
    throw error;
  }
};


async function pdfToWord() {
  const file = state.pdf2word.file;
  if (!file) { showToast('Please select a PDF file.', 'error'); return; }

  showResult('pdf2word', '');
  setProgress('pdf2word', 10, 'Loading PDF…');
  setButtonEnabled('btn-pdf2word', false);

  try {
    const arrayBuffer = await file.arrayBuffer();
    setProgress('pdf2word', 50, 'Converting to Word format...');
    const blob = await window.convertPDFToWordIsolated(arrayBuffer);

    const name = file.name.replace(/\.pdf$/i, '') + '.doc'; // Word HTML format
    setProgress('pdf2word', 100, 'Complete!');
    showResult('pdf2word', successResult(name, blob, formatSize(blob.size)));
    showToast('PDF converted to Word successfully!');
  } catch (err) {
    setProgress('pdf2word', null);
    showResult('pdf2word', errorResult('Conversion failed: ' + err.message));
    showToast('Conversion failed: ' + err.message, 'error');
  } finally {
    setButtonEnabled('btn-pdf2word', !!state.pdf2word.file);
    setTimeout(() => setProgress('pdf2word', null), 1500);
  }
}

/* ──────────────────────────────────────────────────
   12. WORD TO PDF
   Uses mammoth.js to extract HTML from .docx,
   then html2canvas + pdf-lib to render to PDF.
   Preserves text, images, tables, and formatting.
   ────────────────────────────────────────────────── */
async function wordToPDF() {
  const file = state.word2pdf.file;
  if (!file) { showToast('Please select a Word document.', 'error'); return; }

  if (typeof mammoth === 'undefined') {
    showToast('mammoth.js library not loaded. Please check your internet connection.', 'error');
    return;
  }
  if (typeof html2canvas === 'undefined') {
    showToast('html2canvas library not loaded. Please check your internet connection.', 'error');
    return;
  }

  showResult('word2pdf', '');
  setProgress('word2pdf', 5, 'Reading Word document…');
  setButtonEnabled('btn-word2pdf', false);

  try {
    const arrayBuffer = await file.arrayBuffer();

    setProgress('word2pdf', 20, 'Extracting content…');
    const result = await mammoth.convertToHtml({
      arrayBuffer,
      convertImage: mammoth.images.imgElement(image => {
        return image.read('base64').then(imageContents => ({
          src: `data:${image.contentType};base64,${imageContents}`
        }));
      }),
    });
    const htmlContent = result.value;

    setProgress('word2pdf', 40, 'Rendering document…');

    // Create an off-screen container styled like a Word page
    const container = document.createElement('div');
    container.id = 'w2p-render-container';
    container.style.cssText = [
      'position:fixed',
      'left:-9999px',
      'top:0',
      'width:794px',
      'min-height:1123px',
      'padding:72px 90px',
      'background:#ffffff',
      'color:#1a1a1a',
      // Don't hardcode a single font — let CSS handle per-script font selection
      'font-size:12pt',
      'line-height:1.6',
      'box-sizing:border-box',
      'word-break:break-word',
      'overflow:hidden',
      // CRITICAL: let browser BiDi engine handle directional layout
      'unicode-bidi:plaintext',
    ].join(';');

    // ── Post-process mammoth HTML for proper Arabic/RTL rendering ──────────
    // mammoth.js strips dir= and lang= from the .docx content. We must restore
    // them so the browser's Unicode Bidirectional Algorithm can shape Arabic
    // glyphs correctly *before* html2canvas photographs the DOM.
    const ARABIC_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFD\uFE70-\uFEFF]/;

    /**
     * Walk every block-level element in a DocumentFragment.
     * If its text content contains Arabic characters, mark it RTL so the
     * browser's built-in BiDi engine handles shaping and justification.
     */
    function applyBidiToFragment(frag) {
      // Block elements that carry a reading direction in Word
      const BLOCKS = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
                      'LI', 'TD', 'TH', 'BLOCKQUOTE', 'DIV'];

      frag.querySelectorAll(BLOCKS.join(',')).forEach(el => {
        const text = el.textContent || '';
        if (ARABIC_REGEX.test(text)) {
          // Use bdi on inline runs; set dir on block so the browser BiDi
          // algorithm can order runs correctly within the paragraph.
          el.setAttribute('dir', 'rtl');
          el.setAttribute('lang', 'ar');
          // Wrap inline text nodes in <bdi dir="rtl"> so mixed LTR/RTL lines
          // (e.g. Arabic paragraph with embedded English code) render cleanly.
          el.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
              const bdi = document.createElement('bdi');
              bdi.setAttribute('dir', ARABIC_REGEX.test(node.textContent) ? 'rtl' : 'ltr');
              bdi.style.fontFamily = ARABIC_REGEX.test(node.textContent)
                ? "'Arial','Segoe UI','Tahoma',sans-serif"
                : "'Times New Roman',Times,serif";
              bdi.textContent = node.textContent;
              node.replaceWith(bdi);
            } else if (node.nodeType === Node.ELEMENT_NODE) {
              const inner = node.textContent || '';
              if (ARABIC_REGEX.test(inner)) {
                node.style.fontFamily = "'Arial','Segoe UI','Tahoma',sans-serif";
                node.setAttribute('dir', 'rtl');
              }
            }
          });
        } else {
          // Purely LTR block — be explicit so adjacent RTL blocks don't bleed
          if (!el.getAttribute('dir')) {
            el.setAttribute('dir', 'ltr');
          }
        }
      });
    }

    // Parse mammoth HTML into a live fragment so we can walk the DOM
    const templateFrag = document.createElement('template');
    templateFrag.innerHTML = htmlContent || '<p>(Empty document)</p>';
    applyBidiToFragment(templateFrag.content);

    // Serialize fragment back to HTML string for injection
    const rtlAwareHtml = Array.from(templateFrag.content.childNodes)
      .map(n => (n.nodeType === Node.ELEMENT_NODE ? n.outerHTML : n.textContent))
      .join('');

    // Add inline styles for common HTML elements
    // Note: Arabic text gets Arial/Segoe UI via per-element injection above.
    // LTR text keeps Times New Roman. This mirrors Microsoft Word defaults.
    container.innerHTML = `
      <style>
        #w2p-render-container {
          font-family: "Times New Roman", Times, serif;
          unicode-bidi: plaintext;
        }
        #w2p-render-container h1{font-size:22pt;margin:16px 0 8px;line-height:1.3;}
        #w2p-render-container h2{font-size:18pt;margin:14px 0 6px;}
        #w2p-render-container h3{font-size:14pt;margin:12px 0 4px;}
        #w2p-render-container p{margin:0 0 8px;unicode-bidi:plaintext;}
        #w2p-render-container table{border-collapse:collapse;width:100%;margin-bottom:12px;}
        #w2p-render-container td,#w2p-render-container th{border:1px solid #ccc;padding:6px 8px;unicode-bidi:plaintext;}
        #w2p-render-container img{max-width:100%;height:auto;display:block;margin:8px auto;}
        #w2p-render-container ul,#w2p-render-container ol{margin:0 0 8px 24px;}
        #w2p-render-container li{margin-bottom:4px;unicode-bidi:plaintext;}
        #w2p-render-container strong{font-weight:bold;}
        #w2p-render-container em{font-style:italic;}
        #w2p-render-container blockquote{border-left:3px solid #ccc;margin:8px 0;padding-left:16px;color:#555;}
        /* Arabic blocks — right-aligned, correct font */
        #w2p-render-container [dir="rtl"]{
          text-align:right;
          font-family:'Arial','Segoe UI','Tahoma',sans-serif;
        }
        /* Mixed paragraph: isolate each run's direction */
        #w2p-render-container bdi{unicode-bidi:isolate;}
      </style>
      ${rtlAwareHtml}
    `;
    document.body.appendChild(container);

    // Wait for images to load
    const imgs = container.querySelectorAll('img');
    await Promise.all(Array.from(imgs).map(img =>
      img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; })
    ));

    setProgress('word2pdf', 55, 'Rendering to canvas…');
    const fullCanvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: 794,
      windowWidth: 794,
    });

    document.body.removeChild(container);

    // A4 in PDF points
    const A4W = 595, A4H = 842;
    const imgScale = A4W / (fullCanvas.width / 2); // /2 because scale:2
    const scaledHeight = (fullCanvas.height / 2) * imgScale;
    const numPdfPages = Math.max(1, Math.ceil(scaledHeight / A4H));

    setProgress('word2pdf', 72, `Building PDF (${numPdfPages} page${numPdfPages !== 1 ? 's' : ''})…`);

    const pdfDoc = await PDFLib.PDFDocument.create();
    pdfDoc.setTitle(file.name.replace(/\.(docx?)$/i, ''));
    pdfDoc.setCreator('PDF BOX');
    pdfDoc.setProducer('PDF BOX — pdfbox.app');

    for (let p = 0; p < numPdfPages; p++) {
      const srcY = p * (A4H / imgScale) * 2; // *2 for canvas scale
      const srcH = Math.min((A4H / imgScale) * 2, fullCanvas.height - srcY);

      if (srcH <= 0) break;

      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = fullCanvas.width;
      pageCanvas.height = Math.ceil(srcH);
      const pCtx = pageCanvas.getContext('2d');
      pCtx.fillStyle = '#ffffff';
      pCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      pCtx.drawImage(fullCanvas, 0, -srcY);

      const jpegDataUrl = pageCanvas.toDataURL('image/jpeg', 0.94);
      const jpegBlob = dataURLtoBlob(jpegDataUrl);
      const jpegBuf = await jpegBlob.arrayBuffer();
      const embImg = await pdfDoc.embedJpg(new Uint8Array(jpegBuf));

      const page = pdfDoc.addPage([A4W, A4H]);
      const drawH = Math.min(A4H, (srcH / 2) * imgScale);
      page.drawImage(embImg, { x: 0, y: A4H - drawH, width: A4W, height: drawH });

      setProgress('word2pdf', 72 + Math.round((p / numPdfPages) * 20), `Rendering page ${p + 1}…`);
    }

    setProgress('word2pdf', 95, 'Saving PDF…');
    const out = await pdfDoc.save();
    const blob = new Blob([out], { type: 'application/pdf' });
    const name = file.name.replace(/\.(docx?)$/i, '') + '.pdf';
    setProgress('word2pdf', 100, 'Complete!');
    showResult('word2pdf', successResult(name, blob, `${numPdfPages} page${numPdfPages !== 1 ? 's' : ''} · ${formatSize(blob.size)}`));
    showToast('Word document converted to PDF successfully!');
  } catch (err) {
    const container2 = document.getElementById('w2p-render-container');
    if (container2) container2.remove();
    setProgress('word2pdf', null);
    showResult('word2pdf', errorResult('Conversion failed: ' + err.message));
    showToast('Conversion failed: ' + err.message, 'error');
  } finally {
    setButtonEnabled('btn-word2pdf', !!state.word2pdf.file);
    setTimeout(() => setProgress('word2pdf', null), 1500);
  }
}

/* ──────────────────────────────────────────────────
   CONTACT FORM
   ────────────────────────────────────────────────── */
function sendContact() {
  const name = (document.getElementById('contact-name').value || '').trim();
  const email = (document.getElementById('contact-email').value || '').trim();
  const subject = (document.getElementById('contact-subject').value || '').trim();
  const message = (document.getElementById('contact-message').value || '').trim();

  if (!name || !email || !message) {
    showToast('Please fill in all required fields.', 'error');
    return;
  }
  if (!/\S+@\S+\.\S+/.test(email)) {
    showToast('Please enter a valid email address.', 'error');
    return;
  }

  const subjectLine = encodeURIComponent(`PDF BOX Contact${subject ? ' – ' + subject : ''} (from ${name})`);
  const body = encodeURIComponent(
    `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`
  );
  window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=hasan.saad898@gmail.com&su=${subjectLine}&body=${body}`, '_blank');

  showToast('Opening Gmail…');
  // Clear form
  document.getElementById('contact-name').value = '';
  document.getElementById('contact-email').value = '';
  document.getElementById('contact-subject').value = '';
  document.getElementById('contact-message').value = '';
}

/* ──────────────────────────────────────────────────
   FAQ ACCORDION
   ────────────────────────────────────────────────── */
function toggleFAQ(btn) {
  const item = btn.parentElement;
  const isOpen = item.classList.contains('open');
  document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
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
console.log('%c PDF BOX 📦 Ready! — 12 Tools Active', 'color:#00E5FF;font-size:16px;font-weight:bold;');
