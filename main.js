/**
 * main.js — PDFBox UI Orchestration Layer
 * =========================================
 * Manages all UI interactions:
 *  - Sidebar navigation + mobile hamburger drawer
 *  - Drag-and-drop file upload for every tool
 *  - Progress overlay (circular SVG + linear bar)
 *  - Toast notification system
 *  - State management for all 11 tools
 *  - Wires button clicks to processing functions in pdf-tools.js
 */

'use strict';

/* ======================================================================
   APP STATE
   All uploaded files and tool-specific settings live here.
   ====================================================================== */
const state = {
    mergeFiles:     [],          // Array of PDF Files for merging
    splitFile:      null,        // Single PDF for splitting
    imageFiles:     [],          // Array of image Files for Image→PDF
    pdf2imgFile:    null,        // Single PDF for PDF→Image
    pdf2wordFile:   null,        // Single PDF for PDF→Word
    word2pdfFile:   null,        // Single DOCX for Word→PDF
    compressFile:   null,        // Single PDF for compression
    protectFile:    null,        // Single PDF for protection
    unlockFile:     null,        // Single encrypted PDF for unlocking
    watermarkFile:  null,        // Single PDF for watermarking
    deleteFile:     null,        // Single PDF for page deletion
    deleteSelected: new Set(),   // Set of 0-based page indices to delete
};

/* ======================================================================
   DOM REFERENCES
   ====================================================================== */
const progressOverlay  = document.getElementById('progress-overlay');
const progressBarFill  = document.getElementById('progress-bar-fill');
const progressSpinFill = document.querySelector('.spinner-fill');
const progressPct      = document.getElementById('progress-pct');
const progressMsg      = document.getElementById('progress-msg');
const toastContainer   = document.getElementById('toast-container');
const hamburgerBtn     = document.getElementById('hamburger-btn');
const sidebar          = document.getElementById('sidebar');
const sidebarOverlay   = document.getElementById('sidebar-overlay');

/* ======================================================================
   PROGRESS OVERLAY API
   Unified interface used by all processing operations.
   ====================================================================== */

/**
 * The circumference of the SVG spinner circle (r=20 → 2π×20 ≈ 126).
 * Used to calculate stroke-dashoffset for the circular progress indicator.
 */
const CIRCLE_DASH = 125.66;

/**
 * Shows and updates the progress overlay with a percentage and message.
 * Updates both the SVG circular indicator and the linear progress bar.
 *
 * @param {number} pct — Completion percentage (0–100)
 * @param {string} msg — Status message shown to the user
 */
window.updateProgress = function (pct, msg) {
    progressOverlay.classList.remove('hidden');
    const clamped = Math.max(0, Math.min(100, pct));

    // Linear bar
    progressBarFill.style.width = clamped + '%';

    // SVG circular indicator: dashoffset = total - (total × progress)
    const offset = CIRCLE_DASH - (CIRCLE_DASH * clamped / 100);
    progressSpinFill.style.strokeDashoffset = offset;

    // Text labels
    progressPct.textContent = Math.round(clamped) + '%';
    progressMsg.textContent = msg || 'Processing...';
};

/** Compatibility alias for older call sites */
window.showStatus = (msg) => updateProgress(0, msg);

/** Hides the progress overlay after an operation completes or fails. */
window.hideStatus = function () {
    progressOverlay.classList.add('hidden');
};

/* ======================================================================
   TOAST NOTIFICATION API
   ====================================================================== */

/**
 * Displays an animated toast notification in the bottom-right corner.
 *
 * @param {string} title    — Bold headline (e.g. "Done ✓")
 * @param {string} message  — Optional supporting text
 * @param {'success'|'error'|'info'} type
 * @param {number} duration — Auto-dismiss delay in ms (default 4500)
 */
window.showToast = function (title, message = '', type = 'info', duration = 4500) {
    const iconMap = {
        success: 'fa-circle-check',
        error:   'fa-circle-exclamation',
        info:    'fa-circle-info',
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div class="toast-icon"><i class="fa-solid ${iconMap[type]}" aria-hidden="true"></i></div>
        <div class="toast-body">
            <div class="toast-title">${title}</div>
            ${message ? `<div class="toast-msg">${message}</div>` : ''}
        </div>
        <button class="toast-close" aria-label="Dismiss notification">
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
    `;

    // Manual dismiss
    toast.querySelector('.toast-close').addEventListener('click', () => _dismissToast(toast));
    toastContainer.appendChild(toast);

    // Auto-dismiss after duration
    toast._timer = setTimeout(() => _dismissToast(toast), duration);
};

function _dismissToast(toast) {
    clearTimeout(toast._timer);
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 310);
}

/* ======================================================================
   OPERATION WRAPPER
   Wraps every tool's async function with progress management and
   unified error handling, showing a success or error toast automatically.
   ====================================================================== */

/**
 * Runs an async PDF operation with full progress overlay management.
 *
 * @param {Function} asyncFn     — The async processing function to run
 * @param {string}   successMsg  — Toast sub-message shown on success
 * @param {string}   initMsg     — Initial overlay message
 */
async function runOperation(asyncFn, successMsg, initMsg = 'Processing...') {
    updateProgress(0, initMsg);
    try {
        const result = await asyncFn();
        hideStatus();

        // Special handling for compress result (shows size savings)
        if (result && typeof result.savings === 'number') {
            showToast(
                'Compression complete ✓',
                `${formatBytes(result.originalSize)} → ${formatBytes(result.compressedSize)} · saved ${result.savings}%`,
                'success',
                7000
            );
        } else {
            showToast('Done ✓', successMsg, 'success');
        }
    } catch (err) {
        hideStatus();
        console.error('[PDFBox Error]', err);
        showToast('Error', err.message || 'An unexpected error occurred.', 'error', 7000);
    }
}

/* ======================================================================
   HELPERS
   ====================================================================== */

/**
 * Formats a byte count into a human-readable string (e.g. "2.3 MB").
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}

/**
 * Returns the appropriate FontAwesome icon class and CSS class for a file.
 * @param {File} file
 * @returns {{ icon: string, cls: string }}
 */
function getFileIcon(file) {
    const name = (file.name || '').toLowerCase();
    if (name.endsWith('.pdf')) return { icon: 'fa-file-pdf',   cls: 'pdf-icon'  };
    if (name.endsWith('.docx') || name.endsWith('.doc'))
                               return { icon: 'fa-file-word',  cls: 'word-icon' };
    if (file.type && file.type.startsWith('image/'))
                               return { icon: 'fa-file-image', cls: 'img-icon'  };
    return                            { icon: 'fa-file',        cls: 'pdf-icon'  };
}

/* ======================================================================
   NAVIGATION — Sidebar
   ====================================================================== */

const navItems = document.querySelectorAll('.nav-item');
const sections = document.querySelectorAll('.tool-section');

navItems.forEach(item => {
    item.addEventListener('click', () => {
        // Deactivate all items and sections
        navItems.forEach(n => n.classList.remove('active'));
        sections.forEach(s => s.classList.remove('active-section'));

        // Activate clicked item and its corresponding section
        item.classList.add('active');
        const targetId = item.getAttribute('data-target');
        const target   = document.getElementById(targetId);
        if (target) target.classList.add('active-section');

        // Close the mobile sidebar after navigation
        _closeSidebar();
    });

    // Keyboard accessibility: Enter/Space triggers click
    item.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.click(); }
    });
});

/* ======================================================================
   MOBILE HAMBURGER TOGGLE
   ====================================================================== */

hamburgerBtn.addEventListener('click', () => {
    const isOpen = sidebar.classList.toggle('open');
    sidebarOverlay.classList.toggle('active', isOpen);
    hamburgerBtn.setAttribute('aria-expanded', isOpen);
});

sidebarOverlay.addEventListener('click', _closeSidebar);

function _closeSidebar() {
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('active');
    hamburgerBtn.setAttribute('aria-expanded', 'false');
}

/* ======================================================================
   DRAG-AND-DROP CORE
   ====================================================================== */

/**
 * Wires up drag-and-drop events and file-input change events for a drop zone.
 * Also makes clicking anywhere on the zone open the file picker.
 *
 * @param {string}   dropZoneId — ID of the .drop-zone element
 * @param {string}   inputId    — ID of the hidden <input type="file">
 * @param {Function} onFiles    — Callback receiving an array of File objects
 */
function setupDragAndDrop(dropZoneId, inputId, onFiles) {
    const zone  = document.getElementById(dropZoneId);
    const input = document.getElementById(inputId);

    if (!zone || !input) {
        console.warn(`[PDFBox] setupDragAndDrop: element not found (${dropZoneId} / ${inputId})`);
        return;
    }

    // Click anywhere on the zone (except the label) to open file picker
    zone.addEventListener('click', e => {
        if (!e.target.closest('label')) input.click();
    });

    // Drag-over: highlight the zone
    zone.addEventListener('dragover', e => {
        e.preventDefault();
        zone.classList.add('dragover');
    });

    // Drag-leave: only remove highlight when leaving the zone itself
    zone.addEventListener('dragleave', e => {
        if (!zone.contains(e.relatedTarget)) zone.classList.remove('dragover');
    });

    // Drop: collect files and pass to callback
    zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            onFiles(Array.from(e.dataTransfer.files));
        }
    });

    // File input change (click-to-browse path)
    input.addEventListener('change', e => {
        if (e.target.files.length > 0) {
            onFiles(Array.from(e.target.files));
            input.value = ''; // Reset so same file can be re-uploaded
        }
    });
}

/**
 * Sets up a single-file upload zone (used by most tools).
 * On a valid file selection:
 *  - Saves the file to state[stateKey]
 *  - Shows the options panel
 *  - Updates the file-info card
 *  - Enables the action button
 *  - Calls onSelected(file) if provided
 *
 * @param {string}   dropId      — Drop zone element ID
 * @param {string}   inputId     — File input element ID
 * @param {string}   stateKey    — Key in the global `state` object
 * @param {string}   acceptType  — 'application/pdf' | '.docx'
 * @param {string}   optionsId   — Options panel element ID
 * @param {string}   fileInfoId  — File info card element ID
 * @param {string}   btnId       — Action button element ID
 * @param {Function} [onSelected]— Optional async callback after file selection
 */
function setupSingleFileUI(dropId, inputId, stateKey, acceptType, optionsId, fileInfoId, btnId, onSelected = null) {
    setupDragAndDrop(dropId, inputId, files => {
        // Filter by the accepted file type
        let valid = files;
        if (acceptType === 'application/pdf') {
            valid = files.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
        } else if (acceptType === '.docx') {
            valid = files.filter(f => f.name.toLowerCase().endsWith('.docx'));
        }

        if (valid.length === 0) {
            showToast(
                'Invalid file type',
                `Please upload a valid ${acceptType === '.docx' ? 'Word (.docx)' : 'PDF'} file.`,
                'error'
            );
            return;
        }

        const file          = valid[0];
        state[stateKey]     = file;

        // Show options panel and populate file info
        const panel  = document.getElementById(optionsId);
        const info   = document.getElementById(fileInfoId);
        const btn    = document.getElementById(btnId);
        if (panel)   panel.classList.remove('hidden');
        if (btn)     btn.disabled = false;

        if (info) {
            const { icon } = getFileIcon(file);
            info.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i>&nbsp;${file.name}&nbsp;&nbsp;·&nbsp;&nbsp;${formatBytes(file.size)}`;
        }

        // Run optional callback (e.g. count pages, generate thumbnails)
        if (onSelected) onSelected(file).catch(err => console.warn('[PDFBox] onSelected error:', err));
    });
}

/* ======================================================================
   PASSWORD SHOW / HIDE TOGGLES
   Shared by Protect PDF and Unlock PDF.
   ====================================================================== */

document.querySelectorAll('.toggle-pwd').forEach(btn => {
    btn.addEventListener('click', () => {
        const input = document.getElementById(btn.getAttribute('data-target'));
        const icon  = btn.querySelector('i');
        if (!input) return;
        if (input.type === 'password') {
            input.type = 'text';
            icon.classList.replace('fa-eye', 'fa-eye-slash');
        } else {
            input.type = 'password';
            icon.classList.replace('fa-eye-slash', 'fa-eye');
        }
    });
});

/* ======================================================================
   TOOL 1 — MERGE PDFs
   ====================================================================== */

setupDragAndDrop('merge-drop-zone', 'merge-input', files => {
    const pdfs = files.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (pdfs.length === 0) {
        return showToast('Invalid file type', 'Please upload PDF files only.', 'error');
    }
    state.mergeFiles = [...state.mergeFiles, ...pdfs];
    _renderMergeList();
});

/** Re-renders the merge file list from state.mergeFiles */
function _renderMergeList() {
    const list = document.getElementById('merge-file-list');
    const btn  = document.getElementById('merge-btn');
    list.innerHTML = '';

    state.mergeFiles.forEach((file, idx) => {
        const { icon, cls } = getFileIcon(file);
        const li = document.createElement('li');
        li.className = 'file-item';
        li.innerHTML = `
            <div class="file-item-left">
                <div class="file-type-icon ${cls}"><i class="fa-solid ${icon}" aria-hidden="true"></i></div>
                <div>
                    <div class="file-item-name" title="${file.name}">${file.name}</div>
                    <div class="file-item-size">${formatBytes(file.size)}</div>
                </div>
            </div>
            <button class="file-item-remove" aria-label="Remove ${file.name}">
                <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
        `;
        li.querySelector('.file-item-remove').addEventListener('click', () => {
            state.mergeFiles.splice(idx, 1);
            _renderMergeList();
        });
        list.appendChild(li);
    });

    btn.disabled = state.mergeFiles.length < 2;
}

document.getElementById('merge-btn').addEventListener('click', () => {
    if (state.mergeFiles.length < 2) return;
    runOperation(
        () => processMerge(state.mergeFiles),
        'Your merged PDF is downloading.',
        'Merging PDF files...'
    );
});

/* ======================================================================
   TOOL 2 — SPLIT PDF
   ====================================================================== */

setupSingleFileUI(
    'split-drop-zone', 'split-input', 'splitFile', 'application/pdf',
    'split-options', 'split-file-info', 'split-btn',
    async (file) => {
        // Show total page count in the badge
        try {
            const buf = await fileToArrayBuffer(file);
            const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
            const badge = document.getElementById('split-total-pages');
            if (badge) badge.textContent = `${pdf.numPages} pages`;
        } catch (e) {
            console.warn('[PDFBox] Could not read page count:', e);
        }
    }
);

// Toggle the range input visibility based on selected split mode
document.querySelectorAll('input[name="split-mode"]').forEach(radio => {
    radio.addEventListener('change', e => {
        const group = document.getElementById('split-custom-group');
        if (group) group.style.display = e.target.value === 'custom' ? '' : 'none';
    });
});

document.getElementById('split-btn').addEventListener('click', () => {
    if (!state.splitFile) return;
    const mode  = document.querySelector('input[name="split-mode"]:checked').value;
    const range = document.getElementById('split-range').value.trim();

    if (mode === 'custom' && !range) {
        return showToast('Page range required', 'Please enter a page range (e.g. 1-3, 5).', 'error');
    }

    runOperation(
        () => processSplit(state.splitFile, range, mode),
        mode === 'extract'
            ? 'ZIP archive with all individual pages is downloading.'
            : 'Your extracted PDF is downloading.',
        mode === 'extract' ? 'Extracting all pages to ZIP...' : 'Splitting PDF...'
    );
});

/* ======================================================================
   TOOL 3 — IMAGE TO PDF
   ====================================================================== */

let _imgSortable = null;

setupDragAndDrop('img2pdf-drop-zone', 'img2pdf-input', files => {
    const imgs = files.filter(f => f.type && f.type.startsWith('image/'));
    if (imgs.length === 0) {
        return showToast('Invalid file type', 'Please upload image files (JPG, PNG, WebP).', 'error');
    }
    state.imageFiles = [...state.imageFiles, ...imgs];
    _renderImageGrid();
});

/** Re-renders the image preview grid from state.imageFiles */
function _renderImageGrid() {
    const grid = document.getElementById('img2pdf-file-list');
    const btn  = document.getElementById('img2pdf-btn');
    const wrap = document.getElementById('img2pdf-preview-wrap');

    grid.innerHTML = '';

    if (state.imageFiles.length === 0) {
        wrap.classList.add('hidden');
        btn.disabled = true;
        return;
    }

    wrap.classList.remove('hidden');
    btn.disabled = false;

    state.imageFiles.forEach((file, idx) => {
        const li = document.createElement('li');
        li.className    = 'image-preview-item';
        li.dataset.index = idx;

        // Thumbnail preview
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        img.alt = file.name;

        // Order badge (1-based)
        const badge = document.createElement('div');
        badge.className   = 'img-order-badge';
        badge.textContent = idx + 1;

        // Remove button
        const rmBtn = document.createElement('button');
        rmBtn.className = 'img-remove-btn';
        rmBtn.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
        rmBtn.title     = `Remove ${file.name}`;
        rmBtn.setAttribute('aria-label', `Remove ${file.name}`);
        rmBtn.addEventListener('click', e => {
            e.stopPropagation();
            state.imageFiles = state.imageFiles.filter(f => f !== file);
            _renderImageGrid();
        });

        li.append(img, badge, rmBtn);
        grid.appendChild(li);
    });

    // Initialize SortableJS drag-to-reorder (only once per list)
    if (_imgSortable) {
        _imgSortable.destroy();
        _imgSortable = null;
    }
    if (typeof Sortable !== 'undefined') {
        _imgSortable = new Sortable(grid, {
            animation: 180,
            ghostClass: 'sortable-ghost',
            onEnd: () => {
                // Rebuild imageFiles array to match the new DOM order
                const newOrder = [];
                grid.querySelectorAll('.image-preview-item').forEach(item => {
                    newOrder.push(state.imageFiles[parseInt(item.dataset.index)]);
                });
                state.imageFiles = newOrder;
                _renderImageGrid();
            }
        });
    }
}

document.getElementById('img2pdf-btn').addEventListener('click', () => {
    if (state.imageFiles.length === 0) return;
    runOperation(
        () => processImageToPdf(state.imageFiles),
        'Your PDF with all images is downloading.',
        'Building PDF from images...'
    );
});

/* ======================================================================
   TOOL 4 — PDF TO IMAGE
   ====================================================================== */

let _pdf2imgScale = 2; // Default: High quality

// Quality button selection
document.querySelectorAll('#pdf2img-quality-btns .quality-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('#pdf2img-quality-btns .quality-btn')
                .forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _pdf2imgScale = parseFloat(btn.dataset.quality);
    });
});

setupSingleFileUI(
    'pdf2img-drop-zone', 'pdf2img-input', 'pdf2imgFile', 'application/pdf',
    'pdf2img-options', 'pdf2img-file-info', 'pdf2img-btn'
);

document.getElementById('pdf2img-btn').addEventListener('click', () => {
    if (!state.pdf2imgFile) return;
    runOperation(
        () => processPdfToImage(state.pdf2imgFile, _pdf2imgScale),
        'ZIP archive of page images is downloading.',
        'Rendering PDF pages to PNG images...'
    );
});

/* ======================================================================
   TOOL 5 — PDF TO WORD
   ====================================================================== */

setupSingleFileUI(
    'pdf2word-drop-zone', 'pdf2word-input', 'pdf2wordFile', 'application/pdf',
    'pdf2word-options', 'pdf2word-file-info', 'pdf2word-btn'
);

document.getElementById('pdf2word-btn').addEventListener('click', () => {
    if (!state.pdf2wordFile) return;
    const useOcr = document.getElementById('ocr-toggle').checked;
    runOperation(
        () => processPdfToWord(state.pdf2wordFile, useOcr),
        'Your Word document (.docx) is downloading.',
        useOcr ? 'Starting OCR engine (Arabic + English)...' : 'Extracting text from PDF...'
    );
});

/* ======================================================================
   TOOL 6 — WORD TO PDF
   ====================================================================== */

setupSingleFileUI(
    'word2pdf-drop-zone', 'word2pdf-input', 'word2pdfFile', '.docx',
    'word2pdf-options', 'word2pdf-file-info', 'word2pdf-btn'
);

document.getElementById('word2pdf-btn').addEventListener('click', () => {
    if (!state.word2pdfFile) return;
    runOperation(
        () => processWordToPdf(state.word2pdfFile),
        'Your A4 PDF document is downloading.',
        'Converting Word document to PDF...'
    );
});

/* ======================================================================
   TOOL 7 — COMPRESS PDF
   ====================================================================== */

let _compressQuality = 0.65; // Default: Recommended (65%)

// Compression level button selection
document.querySelectorAll('#compress-quality-btns .quality-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('#compress-quality-btns .quality-btn')
                .forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _compressQuality = parseFloat(btn.dataset.quality);
    });
});

setupSingleFileUI(
    'compress-drop-zone', 'compress-input', 'compressFile', 'application/pdf',
    'compress-options', 'compress-file-info', 'compress-btn'
);

document.getElementById('compress-btn').addEventListener('click', () => {
    if (!state.compressFile) return;
    runOperation(
        () => processCompressPdf(state.compressFile, _compressQuality),
        'Your compressed PDF is downloading.',
        'Compressing PDF (image downsampling)...'
    );
});

/* ======================================================================
   TOOL 8 — PROTECT PDF
   ====================================================================== */

setupSingleFileUI(
    'protect-drop-zone', 'protect-input', 'protectFile', 'application/pdf',
    'protect-options', 'protect-file-info', 'protect-btn'
);

// Password strength meter
document.getElementById('protect-password').addEventListener('input', e => {
    const val  = e.target.value;
    const fill = document.getElementById('protect-strength-fill');
    const text = document.getElementById('protect-strength-text');

    // Score 0–5 based on length and character variety
    let score = 0;
    if (val.length >= 6)               score++;
    if (val.length >= 10)              score++;
    if (/[A-Z]/.test(val))            score++;
    if (/[0-9]/.test(val))            score++;
    if (/[^A-Za-z0-9]/.test(val))     score++;

    const levels = [
        { label: '',            color: 'transparent', width: '0%'   },
        { label: 'Weak',        color: '#ef4444',      width: '20%'  },
        { label: 'Fair',        color: '#f59e0b',      width: '40%'  },
        { label: 'Good',        color: '#06b6d4',      width: '65%'  },
        { label: 'Strong',      color: '#00e676',      width: '85%'  },
        { label: 'Very Strong', color: '#00e676',      width: '100%' },
    ];

    const lvl = levels[Math.min(score, 5)];
    fill.style.width           = val.length > 0 ? lvl.width : '0%';
    fill.style.backgroundColor = lvl.color;
    text.textContent           = val.length > 0 ? lvl.label : '';
    text.style.color           = lvl.color;
});

document.getElementById('protect-btn').addEventListener('click', () => {
    if (!state.protectFile) return;
    const pwd = document.getElementById('protect-password').value;
    if (!pwd)       return showToast('Password required', 'Please enter a password to protect the PDF.', 'error');
    if (pwd.length < 4) return showToast('Password too short', 'Please use at least 4 characters.', 'error');

    runOperation(
        () => processProtectPdf(state.protectFile, pwd),
        'Your password-protected PDF is downloading.',
        'Encrypting PDF with password...'
    );
});

/* ======================================================================
   TOOL 9 — UNLOCK PDF
   ====================================================================== */

setupSingleFileUI(
    'unlock-drop-zone', 'unlock-input', 'unlockFile', 'application/pdf',
    'unlock-options', 'unlock-file-info', 'unlock-btn'
);

document.getElementById('unlock-btn').addEventListener('click', () => {
    if (!state.unlockFile) return;
    const pwd = document.getElementById('unlock-password').value;
    // Note: empty password is valid (some PDFs have blank passwords)
    runOperation(
        () => processUnlockPdf(state.unlockFile, pwd),
        'Unlocked PDF is downloading — no password required to open it.',
        'Removing password protection...'
    );
});

/* ======================================================================
   TOOL 10 — WATERMARK PDF
   ====================================================================== */

setupSingleFileUI(
    'watermark-drop-zone', 'watermark-input', 'watermarkFile', 'application/pdf',
    'watermark-options', 'watermark-file-info', 'watermark-btn'
);

document.getElementById('watermark-btn').addEventListener('click', () => {
    if (!state.watermarkFile) return;
    const text = document.getElementById('watermark-text').value.trim();
    if (!text) return showToast('Text required', 'Please enter the watermark text.', 'error');

    runOperation(
        () => processWatermarkPdf(state.watermarkFile, text),
        'Your watermarked PDF is downloading.',
        'Applying watermark to all pages...'
    );
});

/* ======================================================================
   TOOL 11 — DELETE PAGES
   ====================================================================== */

setupSingleFileUI(
    'delete-drop-zone', 'delete-input', 'deleteFile', 'application/pdf',
    'delete-options', 'delete-file-info', 'delete-btn',
    async (file) => {
        // Clear previous selection
        state.deleteSelected.clear();
        document.getElementById('delete-range-input').value = '';

        // Render page thumbnails into the grid
        await generateDeleteThumbnails(file, 'delete-thumbnails', state.deleteSelected);
    }
);

// Sync typed page range → thumbnail selection
document.getElementById('delete-range-input').addEventListener('change', e => {
    if (!state.deleteFile) return;
    const rangeStr = e.target.value.trim();

    const totalThumbs = document.querySelectorAll('#delete-thumbnails .page-thumb').length;
    if (totalThumbs === 0) return;

    // Clear all current selections
    state.deleteSelected.clear();
    document.querySelectorAll('#delete-thumbnails .page-thumb')
            .forEach(t => t.classList.remove('marked-delete'));

    if (!rangeStr) return;

    try {
        // parseRangeStr is defined in pdf-tools.js
        const indices = parseRangeStr(rangeStr, totalThumbs);
        indices.forEach(idx => {
            state.deleteSelected.add(idx);
            const thumb = document.querySelector(`#delete-thumbnails .page-thumb[data-page="${idx + 1}"]`);
            if (thumb) thumb.classList.add('marked-delete');
        });
    } catch (err) {
        showToast('Invalid range', err.message, 'error');
    }
});

document.getElementById('delete-btn').addEventListener('click', () => {
    if (!state.deleteFile) return;
    if (state.deleteSelected.size === 0) {
        return showToast(
            'No pages selected',
            'Click page thumbnails or type page numbers to mark pages for deletion.',
            'error'
        );
    }

    runOperation(
        () => processDeletePages(state.deleteFile, state.deleteSelected),
        `PDF with ${state.deleteSelected.size} page(s) removed is downloading.`,
        'Removing selected pages...'
    );
});
