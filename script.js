'use strict';

/* =========================================================
   FATHOM — PDF Tools
   All processing happens client-side using pdf-lib, pdf.js
   and JSZip. No file ever leaves the browser.
   ========================================================= */

/* ---------- Library setup ---------- */
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const { PDFDocument, degrees, rgb, StandardFonts } = PDFLib;

/* ---------- Small helpers ---------- */

function uid() {
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return bytes + ' B';
  const units = ['KB', 'MB', 'GB'];
  let val = bytes / 1024;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return val.toFixed(val < 10 ? 1 : 0) + ' ' + units[i];
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function isPdfFile(file) {
  return file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name));
}

function isImageFile(file) {
  return file && /^image\/(png|jpe?g)$/.test(file.type);
}

/** Opens a pdf.js document with warnings suppressed (only real errors are logged). */
function loadPdfJsDoc(buf) {
  return pdfjsLib.getDocument({ data: buf, verbosity: 0 }).promise;
}

function hexToRgbTuple(hex) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return [r, g, b];
}

/** Tiny DOM builder: el('div', {class:'x'}, [child1, 'text', child2]) */
function el(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const key in attrs) {
      if (key === 'class') node.className = attrs[key];
      else if (key === 'html') node.innerHTML = attrs[key];
      else if (key.startsWith('on') && typeof attrs[key] === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), attrs[key]);
      } else {
        node.setAttribute(key, attrs[key]);
      }
    }
  }
  (children || []).forEach((child) => {
    if (child === null || child === undefined) return;
    if (typeof child === 'string') node.appendChild(document.createTextNode(child));
    else node.appendChild(child);
  });
  return node;
}

function svgUse(iconId, size, className) {
  const s = size || 16;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', s);
  svg.setAttribute('height', s);
  if (className) svg.setAttribute('class', className);
  const use = document.createElementNS(ns, 'use');
  use.setAttribute('href', '#' + iconId);
  svg.appendChild(use);
  return svg;
}

/* ---------- Toasts ---------- */

function showToast(message, type) {
  type = type || 'info';
  const container = document.getElementById('toastContainer');
  const iconMap = { success: 'icon-check', error: 'icon-close', info: 'icon-doc' };
  const toast = el('div', { class: 'toast toast-' + type }, [
    svgUse(iconMap[type] || 'icon-doc', 18),
    el('span', {}, [message]),
  ]);
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('is-visible'));
  setTimeout(() => {
    toast.classList.remove('is-visible');
    setTimeout(() => toast.remove(), 300);
  }, 4800);
}

/* ---------- Loader overlay (reuses the scan-beam signature motif) ---------- */

function createLoader(text) {
  const overlay = el('div', { class: 'loader-overlay' }, [
    el('div', { class: 'loader-scan' }, [
      el('div', { class: 'loader-doc' }),
      el('div', { class: 'loader-beam' }),
    ]),
    el('p', { class: 'loader-text' }, [text || 'Working…']),
    el('div', { class: 'loader-progress' }, [
      el('div', { class: 'loader-progress-bar' }),
    ]),
  ]);
  overlay.update = (newText, pct) => {
    overlay.querySelector('.loader-text').textContent = newText;
    if (typeof pct === 'number') {
      overlay.querySelector('.loader-progress-bar').style.width = Math.max(0, Math.min(100, pct)) + '%';
    }
  };
  return overlay;
}

/* ---------- Dropzone factory ---------- */

function createDropzone(opts) {
  const { accept, multiple, hint, label, onFiles } = opts;
  const wrap = el('div', {
    class: 'dropzone',
    tabindex: '0',
    role: 'button',
    'aria-label': label || 'Choose file',
  });

  const titleText = label || ('Drop ' + (multiple ? 'files' : 'a file') + ' here or ');
  wrap.appendChild(svgUse('icon-upload', 40));
  wrap.querySelector('svg').classList.add('dropzone-icon');
  wrap.appendChild(
    el('p', { class: 'dropzone-title' }, [titleText, el('span', { class: 'link-text' }, ['browse'])])
  );
  if (hint) wrap.appendChild(el('p', { class: 'dropzone-hint' }, [hint]));

  const input = el('input', {
    type: 'file',
    class: 'visually-hidden',
    accept: accept || '',
  });
  if (multiple) input.setAttribute('multiple', 'multiple');
  wrap.appendChild(input);

  wrap.addEventListener('click', () => input.click());
  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });
  input.addEventListener('change', () => {
    if (input.files && input.files.length) onFiles(Array.from(input.files));
    input.value = '';
  });

  ['dragenter', 'dragover'].forEach((evt) =>
    wrap.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      wrap.classList.add('is-dragover');
    })
  );
  ['dragleave', 'drop'].forEach((evt) =>
    wrap.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      wrap.classList.remove('is-dragover');
    })
  );
  wrap.addEventListener('drop', (e) => {
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) onFiles(multiple ? files : [files[0]]);
  });

  return wrap;
}

/* ---------- Generic single-PDF file info bar (used by most single-file tools) ---------- */

function createFileInfoBar(file, onChange) {
  const bar = el('div', { class: 'file-info-bar' }, [
    svgUse('icon-doc', 26),
    el('div', { class: 'file-text' }, [
      el('p', { class: 'file-info-name' }, [file.name]),
      el('p', { class: 'file-info-meta' }, [formatBytes(file.size)]),
    ]),
    el('button', { class: 'btn btn-secondary btn-sm', onClick: onChange }, ['Change file']),
  ]);
  return bar;
}

/* =========================================================
   NAVIGATION
   ========================================================= */

const homeView = document.getElementById('view-home');
const workspaceView = document.getElementById('view-workspace');
const workspaceTitle = document.getElementById('workspaceTitle');
const workspaceDesc = document.getElementById('workspaceDesc');
const workspaceBody = document.getElementById('workspaceBody');

function goHome() {
  workspaceBody.innerHTML = '';
  workspaceView.hidden = true;
  homeView.hidden = false;
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function scrollToSection(id) {
  const target = document.getElementById(id);
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openTool(toolId) {
  const tool = Tools[toolId];
  if (!tool) return;
  homeView.hidden = true;
  workspaceView.hidden = false;
  workspaceTitle.textContent = tool.title;
  workspaceDesc.textContent = tool.desc;
  workspaceBody.innerHTML = '';
  window.scrollTo({ top: 0, behavior: 'auto' });
  try {
    tool.render(workspaceBody);
  } catch (err) {
    console.error(err);
    showToast('This tool hit a snag loading. Please try again.', 'error');
  }
}

document.addEventListener('click', (e) => {
  const navBtn = e.target.closest('[data-nav]');
  if (!navBtn) return;
  const target = navBtn.getAttribute('data-nav');
  if (target === 'home') {
    goHome();
  } else if (target === 'tools') {
    goHome();
    setTimeout(() => scrollToSection('tools'), 30);
  } else if (target === 'how') {
    goHome();
    setTimeout(() => scrollToSection('how'), 30);
  }
});

document.getElementById('backBtn').addEventListener('click', goHome);

document.querySelectorAll('.tool-card').forEach((card) => {
  card.addEventListener('click', () => openTool(card.getAttribute('data-tool')));
  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--mx', ((e.clientX - rect.left) / rect.width) * 100 + '%');
    card.style.setProperty('--my', ((e.clientY - rect.top) / rect.height) * 100 + '%');
  });
});

/* ---------- Category filter chips ---------- */

document.querySelectorAll('.chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.chip').forEach((c) => c.classList.remove('is-active'));
    chip.classList.add('is-active');
    const filter = chip.getAttribute('data-filter');
    document.querySelectorAll('.tool-card').forEach((card) => {
      const match = filter === 'all' || card.getAttribute('data-category') === filter;
      card.classList.toggle('is-hidden', !match);
    });
  });
});

/* =========================================================
   TOOLS
   Each tool exposes { title, desc, render(container) }
   ========================================================= */

const Tools = {};

/* ---------------------------------------------------------
   1. MERGE PDFs
   --------------------------------------------------------- */
Tools.merge = {
  title: 'Merge PDFs',
  desc: 'Add two or more PDFs, drag to set the order, and combine them into one file.',
  render(container) {
    let files = []; // { id, file, pageCount }

    const dz = createDropzone({
      accept: 'application/pdf,.pdf',
      multiple: true,
      hint: 'PDF files only · nothing is uploaded',
      onFiles: handleFiles,
    });

    const listEl = el('div', { class: 'file-list' });
    const emptyHint = el('p', { class: 'field-hint' }, ['Add at least two PDFs to merge them.']);

    const mergeBtn = el('button', { class: 'btn btn-primary', onClick: doMerge }, [
      svgUse('icon-merge', 16),
      'Merge PDFs',
    ]);
    const clearBtn = el('button', { class: 'btn btn-ghost', onClick: clearAll }, ['Clear all']);
    const actions = el('div', { class: 'workspace-actions' }, [mergeBtn, clearBtn]);

    container.appendChild(dz);
    container.appendChild(listEl);
    container.appendChild(emptyHint);
    container.appendChild(actions);
    updateButtons();

    async function handleFiles(newFiles) {
      for (const f of newFiles) {
        if (!isPdfFile(f)) {
          showToast(`"${f.name}" isn't a PDF, so it was skipped.`, 'error');
          continue;
        }
        const entry = { id: uid(), file: f, pageCount: null };
        files.push(entry);
        renderList();
        try {
          const buf = await f.arrayBuffer();
          const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
          entry.pageCount = doc.getPageCount();
        } catch (err) {
          entry.pageCount = '?';
        }
        renderList();
      }
    }

    function clearAll() {
      files = [];
      renderList();
    }

    function renderList() {
      listEl.innerHTML = '';
      emptyHint.hidden = files.length > 0;
      let dragIndex = null;

      files.forEach((entry, idx) => {
        const row = el('div', { class: 'file-row', draggable: 'true' }, [
          svgUse('icon-drag', 18, 'drag-handle'),
          el('div', { class: 'file-doc-icon' }, [svgUse('icon-doc', 18)]),
          el('div', { class: 'file-text' }, [
            el('p', { class: 'file-name' }, [entry.file.name]),
            el('p', { class: 'file-meta' }, [
              formatBytes(entry.file.size) + (entry.pageCount ? ' · ' + entry.pageCount + ' pages' : ' · reading…'),
            ]),
          ]),
          el('span', { class: 'order-badge' }, ['#' + (idx + 1)]),
          el('button', {
            class: 'btn-icon danger remove-btn',
            'aria-label': 'Remove file',
            onClick: () => {
              files = files.filter((x) => x.id !== entry.id);
              renderList();
            },
          }, [svgUse('icon-close', 15)]),
        ]);

        row.addEventListener('dragstart', () => {
          dragIndex = idx;
          row.classList.add('is-dragging');
        });
        row.addEventListener('dragend', () => row.classList.remove('is-dragging'));
        row.addEventListener('dragover', (e) => {
          e.preventDefault();
          row.classList.add('is-dragover');
        });
        row.addEventListener('dragleave', () => row.classList.remove('is-dragover'));
        row.addEventListener('drop', (e) => {
          e.preventDefault();
          row.classList.remove('is-dragover');
          if (dragIndex === null || dragIndex === idx) return;
          const moved = files.splice(dragIndex, 1)[0];
          files.splice(idx, 0, moved);
          renderList();
        });

        listEl.appendChild(row);
      });
      updateButtons();
    }

    function updateButtons() {
      mergeBtn.disabled = files.length < 2;
    }

    async function doMerge() {
      if (files.length < 2) return;
      const overlay = createLoader('Merging your PDFs…');
      container.style.position = 'relative';
      container.appendChild(overlay);
      mergeBtn.disabled = true;
      try {
        const outDoc = await PDFDocument.create();
        for (let i = 0; i < files.length; i++) {
          overlay.update(`Merging file ${i + 1} of ${files.length}…`, (i / files.length) * 100);
          const buf = await files[i].file.arrayBuffer();
          let srcDoc;
          try {
            srcDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
          } catch (err) {
            throw new Error(`Couldn't read "${files[i].file.name}". It may be corrupted or password protected.`);
          }
          const copied = await outDoc.copyPages(srcDoc, srcDoc.getPageIndices());
          copied.forEach((p) => outDoc.addPage(p));
        }
        overlay.update('Finishing up…', 100);
        const bytes = await outDoc.save();
        downloadBlob(new Blob([bytes], { type: 'application/pdf' }), 'merged.pdf');
        showToast('Your merged PDF is ready to download.', 'success');
      } catch (err) {
        console.error(err);
        showToast(err.message || 'Something went wrong while merging.', 'error');
      } finally {
        overlay.remove();
        updateButtons();
      }
    }
  },
};

/* ---------------------------------------------------------
   2. ORGANIZE PAGES (reorder / rotate / delete / extract)
   --------------------------------------------------------- */
Tools.organize = {
  title: 'Organize Pages',
  desc: 'Drag pages to reorder, rotate or delete the ones you don\u2019t need, or pull a few out into a new file.',
  render(container) {
    let file = null;
    let pages = []; // { origIndex, rotation, selected, dataUrl }

    const dz = createDropzone({
      accept: 'application/pdf,.pdf',
      multiple: false,
      hint: 'One PDF at a time',
      onFiles: (fs) => loadFile(fs[0]),
    });

    const fileBarWrap = el('div', {});
    const toolbar = el('div', { class: 'thumb-toolbar', hidden: 'hidden' }, []);
    const grid = el('div', { class: 'thumb-grid' }, []);
    const area = el('div', { class: 'organize-area' }, [toolbar, grid]);

    container.appendChild(dz);
    container.appendChild(fileBarWrap);
    container.appendChild(area);

    let countLabel, selectAllBtn, deleteBtn, extractBtn, downloadBtn;

    function buildToolbar() {
      countLabel = el('span', { class: 'count-label' }, ['']);
      selectAllBtn = el('button', { class: 'btn btn-ghost btn-sm', onClick: toggleSelectAll }, ['Select all']);
      deleteBtn = el('button', { class: 'btn btn-danger btn-sm', onClick: deleteSelected }, [
        svgUse('icon-trash', 14), ' Delete selected',
      ]);
      extractBtn = el('button', { class: 'btn btn-secondary btn-sm', onClick: () => exportPdf(true) }, [
        'Extract selected',
      ]);
      downloadBtn = el('button', { class: 'btn btn-primary btn-sm', onClick: () => exportPdf(false) }, [
        svgUse('icon-download', 14), ' Download PDF',
      ]);
      toolbar.innerHTML = '';
      toolbar.appendChild(countLabel);
      toolbar.appendChild(el('div', { class: 'toolbar-actions' }, [selectAllBtn, deleteBtn, extractBtn, downloadBtn]));
    }

    async function loadFile(f) {
      if (!isPdfFile(f)) {
        showToast('Please choose a PDF file.', 'error');
        return;
      }
      file = f;
      dz.hidden = true;
      fileBarWrap.innerHTML = '';
      fileBarWrap.appendChild(
        createFileInfoBar(file, () => {
          file = null;
          pages = [];
          fileBarWrap.innerHTML = '';
          area.hidden = true;
          dz.hidden = false;
        })
      );

      const overlay = createLoader('Reading your PDF…');
      container.style.position = 'relative';
      container.appendChild(overlay);
      try {
        const buf = await file.arrayBuffer();
        const pdfjsDoc = await loadPdfJsDoc(buf);
        pages = [];
        for (let i = 1; i <= pdfjsDoc.numPages; i++) {
          overlay.update(`Rendering page ${i} of ${pdfjsDoc.numPages}…`, (i / pdfjsDoc.numPages) * 100);
          const page = await pdfjsDoc.getPage(i);
          const viewport = page.getViewport({ scale: 0.35 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
          pages.push({
            origIndex: i - 1,
            rotation: 0,
            selected: false,
            dataUrl: canvas.toDataURL('image/jpeg', 0.72),
          });
        }
        buildToolbar();
        toolbar.hidden = false;
        area.hidden = false;
        renderGrid();
      } catch (err) {
        console.error(err);
        showToast('Couldn\u2019t open that PDF. It may be corrupted or password protected.', 'error');
        dz.hidden = false;
        fileBarWrap.innerHTML = '';
      } finally {
        overlay.remove();
      }
    }

    function toggleSelectAll() {
      const allSelected = pages.every((p) => p.selected);
      pages.forEach((p) => (p.selected = !allSelected));
      renderGrid();
    }

    function deleteSelected() {
      if (!pages.some((p) => p.selected)) {
        showToast('Select at least one page first.', 'error');
        return;
      }
      pages = pages.filter((p) => !p.selected);
      renderGrid();
    }

    function renderGrid() {
      grid.innerHTML = '';
      let dragIndex = null;
      const selectedCount = pages.filter((p) => p.selected).length;
      countLabel.textContent = `${pages.length} page${pages.length === 1 ? '' : 's'}` +
        (selectedCount ? ` \u00b7 ${selectedCount} selected` : '');
      deleteBtn.disabled = selectedCount === 0;
      extractBtn.disabled = selectedCount === 0;
      downloadBtn.disabled = pages.length === 0;

      pages.forEach((p, idx) => {
        const imgWrap = el('div', { class: 'thumb-img-wrap' }, [
          el('img', { src: p.dataUrl, alt: `Page ${idx + 1}`, style: `transform: rotate(${p.rotation}deg)` }),
          el('div', { class: 'thumb-select-dot' }, [svgUse('icon-check', 12)]),
        ]);
        imgWrap.addEventListener('click', () => {
          p.selected = !p.selected;
          renderGrid();
        });

        const moveLeft = el('button', {
          class: 'thumb-mini-btn', 'aria-label': 'Move earlier',
          onClick: (e) => { e.stopPropagation(); if (idx > 0) { [pages[idx - 1], pages[idx]] = [pages[idx], pages[idx - 1]]; renderGrid(); } },
        }, [svgUse('icon-arrow-left', 13)]);

        const moveRight = el('button', {
          class: 'thumb-mini-btn', 'aria-label': 'Move later', style: 'transform:scaleX(-1)',
          onClick: (e) => { e.stopPropagation(); if (idx < pages.length - 1) { [pages[idx + 1], pages[idx]] = [pages[idx], pages[idx + 1]]; renderGrid(); } },
        }, [svgUse('icon-arrow-left', 13)]);

        const rotateBtn = el('button', {
          class: 'thumb-mini-btn', 'aria-label': 'Rotate page',
          onClick: (e) => { e.stopPropagation(); p.rotation = (p.rotation + 90) % 360; renderGrid(); },
        }, [svgUse('icon-rotate', 13)]);

        const deletePageBtn = el('button', {
          class: 'thumb-mini-btn danger', 'aria-label': 'Delete page',
          onClick: (e) => { e.stopPropagation(); pages = pages.filter((x) => x !== p); renderGrid(); },
        }, [svgUse('icon-trash', 13)]);

        const card = el('div', { class: 'thumb-card' + (p.selected ? ' is-selected' : ''), draggable: 'true' }, [
          imgWrap,
          el('div', { class: 'thumb-meta' }, [
            el('span', { class: 'thumb-page-num' }, ['#' + (idx + 1)]),
            el('div', { class: 'thumb-controls' }, [moveLeft, moveRight, rotateBtn, deletePageBtn]),
          ]),
        ]);

        card.addEventListener('dragstart', () => { dragIndex = idx; card.classList.add('is-dragging'); });
        card.addEventListener('dragend', () => card.classList.remove('is-dragging'));
        card.addEventListener('dragover', (e) => { e.preventDefault(); card.classList.add('is-dragover'); });
        card.addEventListener('dragleave', () => card.classList.remove('is-dragover'));
        card.addEventListener('drop', (e) => {
          e.preventDefault();
          card.classList.remove('is-dragover');
          if (dragIndex === null || dragIndex === idx) return;
          const moved = pages.splice(dragIndex, 1)[0];
          pages.splice(idx, 0, moved);
          renderGrid();
        });

        grid.appendChild(card);
      });
    }

    async function exportPdf(onlySelected) {
      const list = onlySelected ? pages.filter((p) => p.selected) : pages;
      if (!list.length) {
        showToast('There are no pages to export.', 'error');
        return;
      }
      const overlay = createLoader('Building your PDF…');
      container.style.position = 'relative';
      container.appendChild(overlay);
      try {
        const buf = await file.arrayBuffer();
        const srcDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
        const outDoc = await PDFDocument.create();
        const indices = list.map((p) => p.origIndex);
        const copied = await outDoc.copyPages(srcDoc, indices);
        copied.forEach((cp, i) => {
          const total = (cp.getRotation().angle + list[i].rotation) % 360;
          cp.setRotation(degrees(total));
          outDoc.addPage(cp);
        });
        const bytes = await outDoc.save();
        downloadBlob(new Blob([bytes], { type: 'application/pdf' }), onlySelected ? 'extracted.pdf' : 'organized.pdf');
        showToast('Your PDF is ready to download.', 'success');
      } catch (err) {
        console.error(err);
        showToast('Something went wrong while building the PDF.', 'error');
      } finally {
        overlay.remove();
      }
    }
  },
};

/* ---------------------------------------------------------
   3. SPLIT PDF
   --------------------------------------------------------- */
Tools.split = {
  title: 'Split PDF',
  desc: 'Break a PDF into smaller files \u2014 by custom page ranges, a fixed interval, or one file per page.',
  render(container) {
    let file = null;
    let pageCount = 0;

    const dz = createDropzone({
      accept: 'application/pdf,.pdf',
      multiple: false,
      hint: 'One PDF at a time',
      onFiles: (fs) => loadFile(fs[0]),
    });

    const fileBarWrap = el('div', {});
    const fieldGroup = el('div', { class: 'field-group', hidden: 'hidden' }, []);
    const actions = el('div', { class: 'workspace-actions', hidden: 'hidden' }, []);

    container.appendChild(dz);
    container.appendChild(fileBarWrap);
    container.appendChild(fieldGroup);
    container.appendChild(actions);

    async function loadFile(f) {
      if (!isPdfFile(f)) { showToast('Please choose a PDF file.', 'error'); return; }
      file = f;
      dz.hidden = true;
      fileBarWrap.innerHTML = '';
      fileBarWrap.appendChild(createFileInfoBar(file, resetTool));

      try {
        const buf = await file.arrayBuffer();
        const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
        pageCount = doc.getPageCount();
        buildForm();
        fieldGroup.hidden = false;
        actions.hidden = false;
      } catch (err) {
        console.error(err);
        showToast('Couldn\u2019t open that PDF. It may be corrupted or password protected.', 'error');
        resetTool();
      }
    }

    function resetTool() {
      file = null;
      dz.hidden = false;
      fileBarWrap.innerHTML = '';
      fieldGroup.hidden = true;
      actions.hidden = true;
    }

    function buildForm() {
      fieldGroup.innerHTML = '';
      const modeSelect = el('select', { class: 'select-input' }, [
        el('option', { value: 'ranges' }, ['Custom page ranges']),
        el('option', { value: 'every' }, ['Every N pages']),
        el('option', { value: 'each' }, ['Every page as its own file']),
      ]);

      const rangesInput = el('input', {
        type: 'text', class: 'text-input',
        placeholder: 'e.g. 1-4, 5-8, 9',
      });
      const rangesField = el('div', { class: 'field' }, [
        el('label', {}, ['Page ranges']),
        rangesInput,
        el('p', { class: 'field-hint' }, [`This PDF has ${pageCount} pages. Separate ranges with commas.`]),
      ]);

      const everyInput = el('input', { type: 'number', class: 'text-input', value: '2', min: '1', max: String(pageCount) });
      const everyField = el('div', { class: 'field', hidden: 'hidden' }, [
        el('label', {}, ['Pages per file']),
        everyInput,
      ]);

      modeSelect.addEventListener('change', () => {
        rangesField.hidden = modeSelect.value !== 'ranges';
        everyField.hidden = modeSelect.value !== 'every';
      });

      fieldGroup.appendChild(el('div', { class: 'field' }, [el('label', {}, ['Split mode']), modeSelect]));
      fieldGroup.appendChild(rangesField);
      fieldGroup.appendChild(everyField);

      const splitBtn = el('button', { class: 'btn btn-primary', onClick: () => doSplit(modeSelect.value, rangesInput.value, everyInput.value) }, [
        svgUse('icon-split', 16), 'Split PDF',
      ]);
      actions.innerHTML = '';
      actions.appendChild(splitBtn);
    }

    function parseRanges(input, max) {
      const groups = [];
      const tokens = input.split(',').map((t) => t.trim()).filter(Boolean);
      if (!tokens.length) throw new Error('Enter at least one page range.');
      for (const tok of tokens) {
        const m = tok.match(/^(\d+)(?:-(\d+))?$/);
        if (!m) throw new Error(`"${tok}" isn\u2019t a valid page range.`);
        const start = parseInt(m[1], 10);
        const end = m[2] ? parseInt(m[2], 10) : start;
        if (start < 1 || end > max || start > end) {
          throw new Error(`"${tok}" is out of range \u2014 this PDF has ${max} pages.`);
        }
        groups.push({ start, end });
      }
      return groups;
    }

    async function doSplit(mode, rangesValue, everyValue) {
      let groups;
      try {
        if (mode === 'ranges') {
          groups = parseRanges(rangesValue, pageCount);
        } else if (mode === 'every') {
          const n = Math.max(1, parseInt(everyValue, 10) || 1);
          groups = [];
          for (let start = 1; start <= pageCount; start += n) {
            groups.push({ start, end: Math.min(start + n - 1, pageCount) });
          }
        } else {
          groups = [];
          for (let i = 1; i <= pageCount; i++) groups.push({ start: i, end: i });
        }
      } catch (err) {
        showToast(err.message, 'error');
        return;
      }

      const overlay = createLoader('Splitting your PDF…');
      container.style.position = 'relative';
      container.appendChild(overlay);
      try {
        const buf = await file.arrayBuffer();
        const srcDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
        const outputs = [];
        for (let i = 0; i < groups.length; i++) {
          overlay.update(`Creating file ${i + 1} of ${groups.length}…`, (i / groups.length) * 100);
          const g = groups[i];
          const indices = [];
          for (let p = g.start; p <= g.end; p++) indices.push(p - 1);
          const outDoc = await PDFDocument.create();
          const copied = await outDoc.copyPages(srcDoc, indices);
          copied.forEach((p) => outDoc.addPage(p));
          const bytes = await outDoc.save();
          const name = g.start === g.end ? `page_${g.start}.pdf` : `pages_${g.start}-${g.end}.pdf`;
          outputs.push({ name, bytes });
        }

        if (outputs.length === 1) {
          downloadBlob(new Blob([outputs[0].bytes], { type: 'application/pdf' }), outputs[0].name);
        } else {
          overlay.update('Zipping your files…', 100);
          const zip = new JSZip();
          outputs.forEach((o) => zip.file(o.name, o.bytes));
          const zipBlob = await zip.generateAsync({ type: 'blob' });
          downloadBlob(zipBlob, 'split_files.zip');
        }
        showToast(`Split into ${outputs.length} file${outputs.length === 1 ? '' : 's'}.`, 'success');
      } catch (err) {
        console.error(err);
        showToast('Something went wrong while splitting the PDF.', 'error');
      } finally {
        overlay.remove();
      }
    }
  },
};

/* ---------------------------------------------------------
   4. COMPRESS PDF
   --------------------------------------------------------- */
Tools.compress = {
  title: 'Compress PDF',
  desc: 'Shrink a PDF by rebuilding each page as an optimized image \u2014 great for scanned notes or big files an inbox won\u2019t accept.',
  render(container) {
    let file = null;

    container.appendChild(
      el('div', { class: 'info-banner' }, [
        svgUse('icon-bolt', 18),
        el('div', {}, [
          el('span', {}, [
            el('strong', {}, ['How this works: ']),
            'Compress redraws every page as a JPEG image at a lower quality. It shrinks file size well, especially for scanned or image-heavy PDFs, but the text will no longer be selectable or searchable afterward.',
          ]),
        ]),
      ])
    );

    const dz = createDropzone({
      accept: 'application/pdf,.pdf',
      multiple: false,
      hint: 'One PDF at a time',
      onFiles: (fs) => loadFile(fs[0]),
    });
    const fileBarWrap = el('div', {});
    const fieldGroup = el('div', { class: 'field-group', hidden: 'hidden' }, []);
    const actions = el('div', { class: 'workspace-actions', hidden: 'hidden' }, []);
    const resultWrap = el('div', {});

    container.appendChild(dz);
    container.appendChild(fileBarWrap);
    container.appendChild(fieldGroup);
    container.appendChild(actions);
    container.appendChild(resultWrap);

    const levels = {
      low: { scale: 1.0, quality: 0.45, label: 'Smallest file' },
      medium: { scale: 1.4, quality: 0.65, label: 'Balanced' },
      high: { scale: 1.85, quality: 0.8, label: 'Best quality' },
    };
    let selectedLevel = 'medium';

    function loadFile(f) {
      if (!isPdfFile(f)) { showToast('Please choose a PDF file.', 'error'); return; }
      file = f;
      dz.hidden = true;
      resultWrap.innerHTML = '';
      fileBarWrap.innerHTML = '';
      fileBarWrap.appendChild(createFileInfoBar(file, resetTool));
      buildForm();
      fieldGroup.hidden = false;
      actions.hidden = false;
    }

    function resetTool() {
      file = null;
      dz.hidden = false;
      fileBarWrap.innerHTML = '';
      fieldGroup.hidden = true;
      actions.hidden = true;
      resultWrap.innerHTML = '';
    }

    function buildForm() {
      fieldGroup.innerHTML = '';
      const group = el('div', { class: 'radio-group' }, []);
      const groupName = 'compressLevel-' + uid();
      Object.keys(levels).forEach((key) => {
        const lvl = levels[key];
        const captionMap = {
          low: 'Most compression, lowest image quality.',
          medium: 'A good default for most documents.',
          high: 'Larger file, sharper images.',
        };
        const input = el('input', { type: 'radio', name: groupName, value: key });
        input.checked = key === selectedLevel;
        const option = el('label', { class: 'radio-option' + (key === selectedLevel ? ' is-checked' : '') }, [
          input,
          el('div', {}, [
            el('div', { class: 'radio-title' }, [lvl.label]),
            el('div', { class: 'radio-desc' }, [captionMap[key]]),
          ]),
        ]);
        input.addEventListener('change', () => {
          selectedLevel = key;
          group.querySelectorAll('.radio-option').forEach((o) => o.classList.remove('is-checked'));
          option.classList.add('is-checked');
        });
        group.appendChild(option);
      });
      fieldGroup.appendChild(el('div', { class: 'field' }, [el('label', {}, ['Compression level']), group]));

      const compressBtn = el('button', { class: 'btn btn-primary', onClick: doCompress }, [
        svgUse('icon-compress', 16), 'Compress PDF',
      ]);
      actions.innerHTML = '';
      actions.appendChild(compressBtn);
    }

    async function doCompress() {
      const overlay = createLoader('Reading your PDF…');
      container.style.position = 'relative';
      container.appendChild(overlay);
      resultWrap.innerHTML = '';
      try {
        const originalSize = file.size;
        const buf = await file.arrayBuffer();
        const pdfjsDoc = await loadPdfJsDoc(buf);
        const outDoc = await PDFDocument.create();
        const level = levels[selectedLevel];

        for (let i = 1; i <= pdfjsDoc.numPages; i++) {
          overlay.update(`Compressing page ${i} of ${pdfjsDoc.numPages}…`, (i / pdfjsDoc.numPages) * 100);
          const page = await pdfjsDoc.getPage(i);
          const baseVp = page.getViewport({ scale: 1 });
          const renderVp = page.getViewport({ scale: level.scale });
          const canvas = document.createElement('canvas');
          canvas.width = renderVp.width;
          canvas.height = renderVp.height;
          await page.render({ canvasContext: canvas.getContext('2d'), viewport: renderVp }).promise;
          const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', level.quality));
          const arrBuf = await blob.arrayBuffer();
          const jpg = await outDoc.embedJpg(new Uint8Array(arrBuf));
          const pdfPage = outDoc.addPage([baseVp.width, baseVp.height]);
          pdfPage.drawImage(jpg, { x: 0, y: 0, width: baseVp.width, height: baseVp.height });
        }

        overlay.update('Finishing up…', 100);
        const bytes = await outDoc.save();
        const outBlob = new Blob([bytes], { type: 'application/pdf' });
        downloadBlob(outBlob, 'compressed.pdf');

        const newSize = outBlob.size;
        const pct = Math.round((1 - newSize / originalSize) * 100);
        resultWrap.innerHTML = '';
        if (pct > 0) {
          resultWrap.appendChild(
            el('div', { class: 'result-panel' }, [
              svgUse('icon-check', 22),
              el('div', {}, [
                el('p', { class: 'result-title' }, [`${pct}% smaller`]),
                el('p', { class: 'result-sub' }, [`${formatBytes(originalSize)} \u2192 ${formatBytes(newSize)}`]),
              ]),
            ])
          );
          showToast('Your compressed PDF is ready.', 'success');
        } else {
          resultWrap.appendChild(
            el('div', { class: 'info-banner' }, [
              svgUse('icon-doc', 18),
              el('span', {}, ['This PDF was already small, so compression didn\u2019t reduce its size much. It still downloaded.']),
            ])
          );
          showToast('Compressed, but the file was already small.', 'info');
        }
      } catch (err) {
        console.error(err);
        showToast('Something went wrong while compressing the PDF.', 'error');
      } finally {
        overlay.remove();
      }
    }
  },
};

/* ---------------------------------------------------------
   5. IMAGES TO PDF
   --------------------------------------------------------- */
Tools.img2pdf = {
  title: 'Images to PDF',
  desc: 'Add photos or scans, put them in order, and turn them into a single PDF.',
  render(container) {
    let files = []; // { id, file, url }
    let sizeMode = 'fit';

    const dz = createDropzone({
      accept: 'image/png,image/jpeg',
      multiple: true,
      hint: 'PNG or JPG images only',
      onFiles: handleFiles,
    });
    const listEl = el('div', { class: 'file-list' });
    const emptyHint = el('p', { class: 'field-hint' }, ['Add one or more images to build a PDF.']);

    const fieldGroup = el('div', { class: 'field-group' }, []);
    const sizeSelect = el('select', { class: 'select-input' }, [
      el('option', { value: 'fit' }, ['Fit to each image']),
      el('option', { value: 'a4' }, ['A4, centered']),
      el('option', { value: 'letter' }, ['US Letter, centered']),
    ]);
    sizeSelect.addEventListener('change', () => (sizeMode = sizeSelect.value));
    fieldGroup.appendChild(el('div', { class: 'field' }, [el('label', {}, ['Page size']), sizeSelect]));

    const createBtn = el('button', { class: 'btn btn-primary', onClick: doCreate }, [
      svgUse('icon-img2pdf', 16), 'Create PDF',
    ]);
    const clearBtn = el('button', { class: 'btn btn-ghost', onClick: clearAll }, ['Clear all']);
    const actions = el('div', { class: 'workspace-actions' }, [createBtn, clearBtn]);

    container.appendChild(dz);
    container.appendChild(listEl);
    container.appendChild(emptyHint);
    container.appendChild(fieldGroup);
    container.appendChild(actions);
    updateButtons();

    function handleFiles(newFiles) {
      newFiles.forEach((f) => {
        if (!isImageFile(f)) {
          showToast(`"${f.name}" isn\u2019t a PNG or JPG, so it was skipped.`, 'error');
          return;
        }
        files.push({ id: uid(), file: f, url: URL.createObjectURL(f) });
      });
      renderList();
    }

    function clearAll() {
      files = [];
      renderList();
    }

    function renderList() {
      listEl.innerHTML = '';
      emptyHint.hidden = files.length > 0;
      let dragIndex = null;

      files.forEach((entry, idx) => {
        const row = el('div', { class: 'file-row', draggable: 'true' }, [
          svgUse('icon-drag', 18, 'drag-handle'),
          el('img', { class: 'file-thumb', src: entry.url, alt: '' }),
          el('div', { class: 'file-text' }, [
            el('p', { class: 'file-name' }, [entry.file.name]),
            el('p', { class: 'file-meta' }, [formatBytes(entry.file.size)]),
          ]),
          el('span', { class: 'order-badge' }, ['#' + (idx + 1)]),
          el('button', {
            class: 'btn-icon danger remove-btn', 'aria-label': 'Remove image',
            onClick: () => { files = files.filter((x) => x.id !== entry.id); renderList(); },
          }, [svgUse('icon-close', 15)]),
        ]);

        row.addEventListener('dragstart', () => { dragIndex = idx; row.classList.add('is-dragging'); });
        row.addEventListener('dragend', () => row.classList.remove('is-dragging'));
        row.addEventListener('dragover', (e) => { e.preventDefault(); row.classList.add('is-dragover'); });
        row.addEventListener('dragleave', () => row.classList.remove('is-dragover'));
        row.addEventListener('drop', (e) => {
          e.preventDefault();
          row.classList.remove('is-dragover');
          if (dragIndex === null || dragIndex === idx) return;
          const moved = files.splice(dragIndex, 1)[0];
          files.splice(idx, 0, moved);
          renderList();
        });

        listEl.appendChild(row);
      });
      updateButtons();
    }

    function updateButtons() {
      createBtn.disabled = files.length === 0;
    }

    async function doCreate() {
      if (!files.length) return;
      const overlay = createLoader('Building your PDF…');
      container.style.position = 'relative';
      container.appendChild(overlay);
      createBtn.disabled = true;
      try {
        const outDoc = await PDFDocument.create();
        for (let i = 0; i < files.length; i++) {
          overlay.update(`Adding image ${i + 1} of ${files.length}…`, (i / files.length) * 100);
          const f = files[i].file;
          const buf = await f.arrayBuffer();
          const img = f.type === 'image/png' ? await outDoc.embedPng(buf) : await outDoc.embedJpg(buf);

          let pageW, pageH, drawW, drawH, x, y;
          if (sizeMode === 'fit') {
            pageW = img.width; pageH = img.height;
            drawW = pageW; drawH = pageH; x = 0; y = 0;
          } else {
            const [pw, ph] = sizeMode === 'a4' ? [595.28, 841.89] : [612, 792];
            pageW = pw; pageH = ph;
            const margin = 24;
            const maxW = pageW - margin * 2;
            const maxH = pageH - margin * 2;
            const scale = Math.min(maxW / img.width, maxH / img.height);
            drawW = img.width * scale; drawH = img.height * scale;
            x = (pageW - drawW) / 2; y = (pageH - drawH) / 2;
          }
          const page = outDoc.addPage([pageW, pageH]);
          page.drawImage(img, { x, y, width: drawW, height: drawH });
        }
        overlay.update('Finishing up…', 100);
        const bytes = await outDoc.save();
        downloadBlob(new Blob([bytes], { type: 'application/pdf' }), 'images.pdf');
        showToast('Your PDF is ready to download.', 'success');
      } catch (err) {
        console.error(err);
        showToast('Something went wrong while creating the PDF.', 'error');
      } finally {
        overlay.remove();
        updateButtons();
      }
    }
  },
};

/* ---------------------------------------------------------
   6. PDF TO IMAGES
   --------------------------------------------------------- */
Tools.pdf2img = {
  title: 'PDF to Images',
  desc: 'Export every page of a PDF as a PNG or JPG you can drop into a slide or a doc.',
  render(container) {
    let file = null;

    const dz = createDropzone({
      accept: 'application/pdf,.pdf',
      multiple: false,
      hint: 'One PDF at a time',
      onFiles: (fs) => loadFile(fs[0]),
    });
    const fileBarWrap = el('div', {});
    const fieldGroup = el('div', { class: 'field-group', hidden: 'hidden' }, []);
    const actions = el('div', { class: 'workspace-actions', hidden: 'hidden' }, []);
    const resultGrid = el('div', { class: 'image-result-grid' });

    container.appendChild(dz);
    container.appendChild(fileBarWrap);
    container.appendChild(fieldGroup);
    container.appendChild(actions);
    container.appendChild(resultGrid);

    let format = 'png';
    let resKey = 'medium';
    const resLevels = { low: 1, medium: 2, high: 3 };

    function loadFile(f) {
      if (!isPdfFile(f)) { showToast('Please choose a PDF file.', 'error'); return; }
      file = f;
      dz.hidden = true;
      resultGrid.innerHTML = '';
      fileBarWrap.innerHTML = '';
      fileBarWrap.appendChild(createFileInfoBar(file, resetTool));
      buildForm();
      fieldGroup.hidden = false;
      actions.hidden = false;
    }

    function resetTool() {
      file = null;
      dz.hidden = false;
      fileBarWrap.innerHTML = '';
      fieldGroup.hidden = true;
      actions.hidden = true;
      resultGrid.innerHTML = '';
    }

    function buildForm() {
      fieldGroup.innerHTML = '';
      const formatSelect = el('select', { class: 'select-input' }, [
        el('option', { value: 'png' }, ['PNG']),
        el('option', { value: 'jpeg' }, ['JPG']),
      ]);
      formatSelect.addEventListener('change', () => (format = formatSelect.value));

      const resSelect = el('select', { class: 'select-input' }, [
        el('option', { value: 'low' }, ['Low (fast, smaller files)']),
        el('option', { value: 'medium', selected: 'selected' }, ['Medium']),
        el('option', { value: 'high' }, ['High (sharpest, larger files)']),
      ]);
      resSelect.value = resKey;
      resSelect.addEventListener('change', () => (resKey = resSelect.value));

      fieldGroup.appendChild(
        el('div', { class: 'field-row' }, [
          el('div', { class: 'field' }, [el('label', {}, ['Format']), formatSelect]),
          el('div', { class: 'field' }, [el('label', {}, ['Resolution']), resSelect]),
        ])
      );

      const convertBtn = el('button', { class: 'btn btn-primary', onClick: doConvert }, [
        svgUse('icon-pdf2img', 16), 'Convert to images',
      ]);
      actions.innerHTML = '';
      actions.appendChild(convertBtn);
    }

    async function doConvert() {
      const overlay = createLoader('Reading your PDF…');
      container.style.position = 'relative';
      container.appendChild(overlay);
      resultGrid.innerHTML = '';
      try {
        const buf = await file.arrayBuffer();
        const pdfjsDoc = await loadPdfJsDoc(buf);
        const mime = format === 'png' ? 'image/png' : 'image/jpeg';
        const ext = format === 'png' ? 'png' : 'jpg';
        const scale = resLevels[resKey];
        const results = [];

        for (let i = 1; i <= pdfjsDoc.numPages; i++) {
          overlay.update(`Rendering page ${i} of ${pdfjsDoc.numPages}…`, (i / pdfjsDoc.numPages) * 100);
          const page = await pdfjsDoc.getPage(i);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
          const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, 0.9));
          results.push({ name: `page_${i}.${ext}`, blob, thumb: canvas.toDataURL('image/jpeg', 0.6) });
        }

        results.forEach((r, i) => {
          resultGrid.appendChild(
            el('div', { class: 'image-result-card' }, [
              el('span', { class: 'thumb-page-num' }, ['Page ' + (i + 1)]),
              el('img', { src: r.thumb, alt: '', style: 'width:100%;border-radius:4px;margin-bottom:8px;' }),
              el('button', {
                class: 'btn-icon', 'aria-label': 'Download this page',
                onClick: () => downloadBlob(r.blob, r.name),
              }, [svgUse('icon-download', 14)]),
            ])
          );
        });

        if (results.length === 1) {
          downloadBlob(results[0].blob, results[0].name);
        } else {
          overlay.update('Zipping your images…', 100);
          const zip = new JSZip();
          for (const r of results) zip.file(r.name, r.blob);
          const zipBlob = await zip.generateAsync({ type: 'blob' });
          downloadBlob(zipBlob, 'pdf_pages.zip');
        }
        showToast(`Exported ${results.length} image${results.length === 1 ? '' : 's'}.`, 'success');
      } catch (err) {
        console.error(err);
        showToast('Something went wrong while converting the PDF.', 'error');
      } finally {
        overlay.remove();
      }
    }
  },
};

/* ---------------------------------------------------------
   7. PDF TO TEXT
   --------------------------------------------------------- */
Tools.pdf2text = {
  title: 'PDF to Text',
  desc: 'Pull the plain text out of a PDF so you can copy it into notes or edit it.',
  render(container) {
    let file = null;

    const dz = createDropzone({
      accept: 'application/pdf,.pdf',
      multiple: false,
      hint: 'One PDF at a time',
      onFiles: (fs) => loadFile(fs[0]),
    });
    const fileBarWrap = el('div', {});
    const resultWrap = el('div', {});

    container.appendChild(dz);
    container.appendChild(fileBarWrap);
    container.appendChild(resultWrap);

    function loadFile(f) {
      if (!isPdfFile(f)) { showToast('Please choose a PDF file.', 'error'); return; }
      file = f;
      dz.hidden = true;
      resultWrap.innerHTML = '';
      fileBarWrap.innerHTML = '';
      fileBarWrap.appendChild(createFileInfoBar(file, resetTool));
      extractText();
    }

    function resetTool() {
      file = null;
      dz.hidden = false;
      fileBarWrap.innerHTML = '';
      resultWrap.innerHTML = '';
    }

    async function extractText() {
      const overlay = createLoader('Reading your PDF…');
      container.style.position = 'relative';
      container.appendChild(overlay);
      try {
        const buf = await file.arrayBuffer();
        const pdfjsDoc = await loadPdfJsDoc(buf);
        let allText = '';
        let nonEmptyPages = 0;
        for (let i = 1; i <= pdfjsDoc.numPages; i++) {
          overlay.update(`Extracting text from page ${i} of ${pdfjsDoc.numPages}…`, (i / pdfjsDoc.numPages) * 100);
          const page = await pdfjsDoc.getPage(i);
          const content = await page.getTextContent();
          const pageText = content.items.map((it) => it.str).join(' ').replace(/\s+/g, ' ').trim();
          if (pageText) nonEmptyPages++;
          allText += (i > 1 ? '\n\n' : '') + `--- Page ${i} ---\n` + pageText;
        }

        resultWrap.innerHTML = '';
        if (nonEmptyPages === 0) {
          resultWrap.appendChild(
            el('div', { class: 'info-banner' }, [
              svgUse('icon-doc', 18),
              el('span', {}, ['This PDF doesn\u2019t seem to contain selectable text \u2014 it may be a scanned document made entirely of images. A text extraction won\u2019t find anything useful here.']),
            ])
          );
          showToast('No selectable text was found in this PDF.', 'info');
          return;
        }

        const textarea = el('textarea', { class: 'text-input', rows: '16', readonly: 'readonly' }, [allText]);
        textarea.value = allText;
        const copyBtn = el('button', {
          class: 'btn btn-secondary',
          onClick: async () => {
            try {
              await navigator.clipboard.writeText(allText);
              showToast('Copied to your clipboard.', 'success');
            } catch (e) {
              showToast('Couldn\u2019t copy automatically \u2014 select the text and copy manually.', 'error');
            }
          },
        }, ['Copy to clipboard']);
        const downloadBtn = el('button', {
          class: 'btn btn-primary',
          onClick: () => downloadBlob(new Blob([allText], { type: 'text/plain' }), file.name.replace(/\.pdf$/i, '') + '.txt'),
        }, [svgUse('icon-download', 16), 'Download as .txt']);

        resultWrap.appendChild(el('div', { class: 'field' }, [el('label', {}, ['Extracted text']), textarea]));
        resultWrap.appendChild(el('div', { class: 'workspace-actions' }, [downloadBtn, copyBtn]));
        showToast('Text extracted.', 'success');
      } catch (err) {
        console.error(err);
        showToast('Something went wrong while reading the PDF.', 'error');
      } finally {
        overlay.remove();
      }
    }
  },
};

/* ---------------------------------------------------------
   8. ADD WATERMARK
   --------------------------------------------------------- */
Tools.watermark = {
  title: 'Add Watermark',
  desc: 'Stamp text across every page \u2014 useful for marking drafts before you share them.',
  render(container) {
    let file = null;

    const dz = createDropzone({
      accept: 'application/pdf,.pdf',
      multiple: false,
      hint: 'One PDF at a time',
      onFiles: (fs) => loadFile(fs[0]),
    });
    const fileBarWrap = el('div', {});
    const fieldGroup = el('div', { class: 'field-group', hidden: 'hidden' }, []);
    const actions = el('div', { class: 'workspace-actions', hidden: 'hidden' }, []);

    container.appendChild(dz);
    container.appendChild(fileBarWrap);
    container.appendChild(fieldGroup);
    container.appendChild(actions);

    const state = { text: 'DRAFT', size: 48, opacity: 0.3, angle: 45, color: '#17A398', layout: 'single' };

    function loadFile(f) {
      if (!isPdfFile(f)) { showToast('Please choose a PDF file.', 'error'); return; }
      file = f;
      dz.hidden = true;
      fileBarWrap.innerHTML = '';
      fileBarWrap.appendChild(createFileInfoBar(file, resetTool));
      buildForm();
      fieldGroup.hidden = false;
      actions.hidden = false;
    }

    function resetTool() {
      file = null;
      dz.hidden = false;
      fileBarWrap.innerHTML = '';
      fieldGroup.hidden = true;
      actions.hidden = true;
    }

    function buildForm() {
      fieldGroup.innerHTML = '';

      const textInput = el('input', { type: 'text', class: 'text-input', value: state.text });
      textInput.addEventListener('input', () => (state.text = textInput.value || 'DRAFT'));

      const sizeRange = el('input', { type: 'range', min: '14', max: '120', value: String(state.size) });
      const sizeValue = el('span', { class: 'range-value' }, [state.size + 'px']);
      sizeRange.addEventListener('input', () => { state.size = Number(sizeRange.value); sizeValue.textContent = state.size + 'px'; });

      const opacityRange = el('input', { type: 'range', min: '5', max: '100', value: String(state.opacity * 100) });
      const opacityValue = el('span', { class: 'range-value' }, [Math.round(state.opacity * 100) + '%']);
      opacityRange.addEventListener('input', () => { state.opacity = Number(opacityRange.value) / 100; opacityValue.textContent = opacityRange.value + '%'; });

      const angleRange = el('input', { type: 'range', min: '-90', max: '90', value: String(state.angle) });
      const angleValue = el('span', { class: 'range-value' }, [state.angle + '\u00b0']);
      angleRange.addEventListener('input', () => { state.angle = Number(angleRange.value); angleValue.textContent = angleRange.value + '\u00b0'; });

      const layoutSelect = el('select', { class: 'select-input' }, [
        el('option', { value: 'single' }, ['Single, centered']),
        el('option', { value: 'tiled' }, ['Tiled, repeated']),
      ]);
      layoutSelect.addEventListener('change', () => (state.layout = layoutSelect.value));

      const presetColors = ['#17A398', '#8FA9B3', '#D64545', '#EAF6F4'];
      const colorInput = el('input', { type: 'color', value: state.color });
      colorInput.addEventListener('input', () => {
        state.color = colorInput.value;
        swatchWrap.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('is-active'));
      });
      const swatchWrap = el('div', { class: 'color-swatches' }, [colorInput]);
      presetColors.forEach((c) => {
        const sw = el('button', { class: 'color-swatch', style: `background:${c}`, type: 'button', 'aria-label': 'Use color ' + c });
        sw.addEventListener('click', () => {
          state.color = c;
          colorInput.value = c;
          swatchWrap.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('is-active'));
          sw.classList.add('is-active');
        });
        swatchWrap.appendChild(sw);
      });

      fieldGroup.appendChild(el('div', { class: 'field' }, [el('label', {}, ['Watermark text']), textInput]));
      fieldGroup.appendChild(
        el('div', { class: 'field-row' }, [
          el('div', { class: 'field' }, [el('label', {}, ['Font size']), el('div', { class: 'range-row' }, [sizeRange, sizeValue])]),
          el('div', { class: 'field' }, [el('label', {}, ['Opacity']), el('div', { class: 'range-row' }, [opacityRange, opacityValue])]),
        ])
      );
      fieldGroup.appendChild(
        el('div', { class: 'field-row' }, [
          el('div', { class: 'field' }, [el('label', {}, ['Angle']), el('div', { class: 'range-row' }, [angleRange, angleValue])]),
          el('div', { class: 'field' }, [el('label', {}, ['Layout']), layoutSelect]),
        ])
      );
      fieldGroup.appendChild(el('div', { class: 'field' }, [el('label', {}, ['Color']), swatchWrap]));

      const applyBtn = el('button', { class: 'btn btn-primary', onClick: doApply }, [
        svgUse('icon-watermark', 16), 'Add watermark & download',
      ]);
      actions.innerHTML = '';
      actions.appendChild(applyBtn);
    }

    async function doApply() {
      if (!state.text.trim()) { showToast('Enter some watermark text first.', 'error'); return; }
      const overlay = createLoader('Applying your watermark…');
      container.style.position = 'relative';
      container.appendChild(overlay);
      try {
        const buf = await file.arrayBuffer();
        const srcDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
        const font = await srcDoc.embedFont(StandardFonts.HelveticaBold);
        const colorTuple = hexToRgbTuple(state.color);
        const pages = srcDoc.getPages();

        pages.forEach((page, idx) => {
          overlay.update(`Stamping page ${idx + 1} of ${pages.length}…`, (idx / pages.length) * 100);
          const { width, height } = page.getSize();
          const textWidth = font.widthOfTextAtSize(state.text, state.size);
          const drawOpts = {
            size: state.size, font, color: rgb(colorTuple[0], colorTuple[1], colorTuple[2]),
            opacity: state.opacity, rotate: degrees(state.angle),
          };
          if (state.layout === 'single') {
            page.drawText(state.text, { ...drawOpts, x: width / 2 - textWidth / 2, y: height / 2 });
          } else {
            const stepX = textWidth + 90;
            const stepY = state.size * 4.5;
            for (let y = -height * 0.5; y < height * 1.5; y += stepY) {
              for (let x = -width * 0.5; x < width * 1.5; x += stepX) {
                page.drawText(state.text, { ...drawOpts, x, y });
              }
            }
          }
        });

        const bytes = await srcDoc.save();
        downloadBlob(new Blob([bytes], { type: 'application/pdf' }), 'watermarked.pdf');
        showToast('Your watermarked PDF is ready.', 'success');
      } catch (err) {
        console.error(err);
        showToast('Something went wrong while adding the watermark.', 'error');
      } finally {
        overlay.remove();
      }
    }
  },
};

/* ---------------------------------------------------------
   9. ADD PAGE NUMBERS
   --------------------------------------------------------- */
Tools.pagenum = {
  title: 'Add Page Numbers',
  desc: 'Number every page of a PDF, in the position and format you pick.',
  render(container) {
    let file = null;

    const dz = createDropzone({
      accept: 'application/pdf,.pdf',
      multiple: false,
      hint: 'One PDF at a time',
      onFiles: (fs) => loadFile(fs[0]),
    });
    const fileBarWrap = el('div', {});
    const fieldGroup = el('div', { class: 'field-group', hidden: 'hidden' }, []);
    const actions = el('div', { class: 'workspace-actions', hidden: 'hidden' }, []);

    container.appendChild(dz);
    container.appendChild(fileBarWrap);
    container.appendChild(fieldGroup);
    container.appendChild(actions);

    const state = { position: 'bottom-center', format: 'page-n-of-total', start: 1, size: 11, margin: 28 };

    function loadFile(f) {
      if (!isPdfFile(f)) { showToast('Please choose a PDF file.', 'error'); return; }
      file = f;
      dz.hidden = true;
      fileBarWrap.innerHTML = '';
      fileBarWrap.appendChild(createFileInfoBar(file, resetTool));
      buildForm();
      fieldGroup.hidden = false;
      actions.hidden = false;
    }

    function resetTool() {
      file = null;
      dz.hidden = false;
      fileBarWrap.innerHTML = '';
      fieldGroup.hidden = true;
      actions.hidden = true;
    }

    function buildForm() {
      fieldGroup.innerHTML = '';

      const posSelect = el('select', { class: 'select-input' }, [
        el('option', { value: 'bottom-center' }, ['Bottom center']),
        el('option', { value: 'bottom-right' }, ['Bottom right']),
        el('option', { value: 'bottom-left' }, ['Bottom left']),
        el('option', { value: 'top-center' }, ['Top center']),
        el('option', { value: 'top-right' }, ['Top right']),
        el('option', { value: 'top-left' }, ['Top left']),
      ]);
      posSelect.value = state.position;
      posSelect.addEventListener('change', () => (state.position = posSelect.value));

      const formatSelect = el('select', { class: 'select-input' }, [
        el('option', { value: 'n' }, ['1']),
        el('option', { value: 'page-n' }, ['Page 1']),
        el('option', { value: 'n-of-total' }, ['1 / 12']),
        el('option', { value: 'page-n-of-total' }, ['Page 1 of 12']),
      ]);
      formatSelect.value = state.format;
      formatSelect.addEventListener('change', () => (state.format = formatSelect.value));

      const startInput = el('input', { type: 'number', class: 'text-input', value: String(state.start), min: '0' });
      startInput.addEventListener('input', () => (state.start = parseInt(startInput.value, 10) || 1));

      const sizeRange = el('input', { type: 'range', min: '8', max: '24', value: String(state.size) });
      const sizeValue = el('span', { class: 'range-value' }, [state.size + 'px']);
      sizeRange.addEventListener('input', () => { state.size = Number(sizeRange.value); sizeValue.textContent = state.size + 'px'; });

      fieldGroup.appendChild(
        el('div', { class: 'field-row' }, [
          el('div', { class: 'field' }, [el('label', {}, ['Position']), posSelect]),
          el('div', { class: 'field' }, [el('label', {}, ['Format']), formatSelect]),
        ])
      );
      fieldGroup.appendChild(
        el('div', { class: 'field-row' }, [
          el('div', { class: 'field' }, [el('label', {}, ['Start at']), startInput]),
          el('div', { class: 'field' }, [el('label', {}, ['Font size']), el('div', { class: 'range-row' }, [sizeRange, sizeValue])]),
        ])
      );

      const applyBtn = el('button', { class: 'btn btn-primary', onClick: doApply }, [
        svgUse('icon-pagenum', 16), 'Add page numbers & download',
      ]);
      actions.innerHTML = '';
      actions.appendChild(applyBtn);
    }

    function formatLabel(fmt, n, total) {
      switch (fmt) {
        case 'n': return String(n);
        case 'page-n': return `Page ${n}`;
        case 'n-of-total': return `${n} / ${total}`;
        default: return `Page ${n} of ${total}`;
      }
    }

    async function doApply() {
      const overlay = createLoader('Numbering your pages…');
      container.style.position = 'relative';
      container.appendChild(overlay);
      try {
        const buf = await file.arrayBuffer();
        const srcDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
        const font = await srcDoc.embedFont(StandardFonts.Helvetica);
        const pages = srcDoc.getPages();
        const total = pages.length;

        pages.forEach((page, idx) => {
          overlay.update(`Numbering page ${idx + 1} of ${total}…`, (idx / total) * 100);
          const num = state.start + idx;
          const label = formatLabel(state.format, num, total);
          const { width, height } = page.getSize();
          const textWidth = font.widthOfTextAtSize(label, state.size);
          let x, y;
          const m = state.margin;
          if (state.position.endsWith('center')) x = width / 2 - textWidth / 2;
          else if (state.position.endsWith('right')) x = width - m - textWidth;
          else x = m;
          y = state.position.startsWith('bottom') ? m : height - m;
          page.drawText(label, { x, y, size: state.size, font, color: rgb(0.16, 0.19, 0.22) });
        });

        const bytes = await srcDoc.save();
        downloadBlob(new Blob([bytes], { type: 'application/pdf' }), 'numbered.pdf');
        showToast('Your numbered PDF is ready.', 'success');
      } catch (err) {
        console.error(err);
        showToast('Something went wrong while numbering the pages.', 'error');
      } finally {
        overlay.remove();
      }
    }
  },
};
