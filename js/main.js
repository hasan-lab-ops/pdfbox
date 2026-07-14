const tools = [
    { id: 'merge', title: 'Merge PDF', icon: 'files', desc: 'Combine multiple PDFs into one unified document.' },
    { id: 'split', title: 'Split PDF', icon: 'file-minus', desc: 'Separate one page or a whole set for easy conversion into independent PDF files.' },
    { id: 'compress', title: 'Compress PDF', icon: 'minimize', desc: 'Reduce file size while optimizing for maximal PDF quality.' },
    { id: 'pdf-to-word', title: 'PDF to Word', icon: 'file-text', desc: '🔄 Convert PDF to editable Word (.docx) format with text extraction.' },
    { id: 'word-to-pdf', title: 'Word to PDF', icon: 'file', desc: '🔄 Convert Word (.docx) documents to professional PDF files.' },
    { id: 'pdf-to-jpg', title: 'PDF to JPG', icon: 'image', desc: 'Convert each PDF page into a JPG image.' },
    { id: 'jpg-to-pdf', title: 'JPG to PDF', icon: 'image', desc: 'Convert JPG images to PDF in seconds.' },
    { id: 'rotate', title: 'Rotate PDF', icon: 'rotate-cw', desc: 'Rotate your PDFs the way you need them.' },
    { id: 'delete', title: 'Delete Pages', icon: 'trash-2', desc: 'Remove pages from a PDF document.' },
    { id: 'protect-pdf', title: 'Protect PDF', icon: 'lock', desc: '🔐 Add password protection & 128-bit encryption to PDFs.' },
    { id: 'unlock-pdf', title: 'Unlock PDF', icon: 'unlock', desc: '🔓 Remove password protection and decrypt PDF files.' },
    { id: 'watermark', title: 'Watermark', icon: 'droplet', desc: 'Stamp an image or text over your PDF.' }
];

document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    lucide.createIcons();
    initRouter();
    renderToolsGrid();
    setupDropzone();
});

function initRouter() {
    const handleHashChange = () => {
        const hash = window.location.hash || '#home';
        const [path, query] = hash.split('?');

        if (path === '#auth' && currentUser) {
            window.location.hash = '#home';
            return;
        }

        // Hide all views
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));

        if (path === '#tool' && query) {
            const params = new URLSearchParams(query);
            const toolId = params.get('id');
            const tool = tools.find(t => t.id === toolId);

            if (tool) {
                const toolView = document.getElementById('view-tool-detail');
                toolView.classList.remove('hidden');
                toolView.classList.remove('view-animate-enter');
                void toolView.offsetWidth;
                toolView.classList.add('view-animate-enter');
                const cleanup = () => {
                    toolView.classList.remove('view-animate-enter');
                    toolView.removeEventListener('animationend', cleanup);
                };
                toolView.addEventListener('animationend', cleanup);
                initToolDetailView(tool);
            } else {
                window.location.hash = '#home';
            }
        } else {
            const viewId = `view-${path.substring(1)}`;
            const viewEl = document.getElementById(viewId);
            if (viewEl) {
                viewEl.classList.remove('hidden');
            } else {
                document.getElementById('view-home').classList.remove('hidden');
            }
        }

        // Scroll to top on navigation
        window.scrollTo(0, 0);
    };

    window.addEventListener('hashchange', handleHashChange);
    handleHashChange(); // Trigger on initial load
}

function renderToolsGrid() {
    const homeGrid = document.getElementById('home-tools-grid');
    const allGrid = document.getElementById('all-tools-grid');

    let html = '';
    tools.forEach(tool => {
        html += `
            <a href="#tool?id=${tool.id}" class="tool-card">
                <div class="tool-icon">
                    <i data-lucide="${tool.icon}"></i>
                </div>
                <h3>${tool.title}</h3>
                <p>${tool.desc}</p>
            </a>
        `;
    });

    if (homeGrid) homeGrid.innerHTML = html; // In a real app we might only show top 6, but showing all for now
    if (allGrid) allGrid.innerHTML = html;

    lucide.createIcons();
}

let currentTool = null;
let selectedFiles = [];
let selectedPageIndices = [];
let currentPreviewFile = null;

function initToolDetailView(tool) {
    currentTool = tool;
    selectedFiles = []; // Reset state
    resetPageRotations();
    resetSplitPositions();

    document.getElementById('tool-detail-title').innerText = tool.title;
    document.getElementById('tool-detail-desc').innerText = tool.desc;
    document.getElementById('tool-detail-icon').innerHTML = `<i data-lucide="${tool.icon}"></i>`;
    lucide.createIcons();

    resetWorkspace();

    const fileInput = document.getElementById('file-input');
    if (fileInput) {
        if (tool.id === 'jpg-to-pdf') {
            fileInput.accept = 'image/*';
            fileInput.multiple = true;
        } else if (tool.id === 'merge') {
            fileInput.accept = '.pdf';
            fileInput.multiple = true;
        } else if (tool.id === 'word-to-pdf') {
            fileInput.accept = '.docx,.doc';
            fileInput.multiple = false;
        } else if (tool.id === 'pdf-to-word') {
            fileInput.accept = '.pdf';
            fileInput.multiple = false;
        } else {
            fileInput.accept = '.pdf';
            fileInput.multiple = false;
        }
    }

    // Inject dynamic SEO article
    const articleContainer = document.getElementById('tool-detail-article');
    if (articleContainer && window.toolArticles && window.toolArticles[tool.id]) {
        articleContainer.innerHTML = window.toolArticles[tool.id];
    } else if (articleContainer) {
        articleContainer.innerHTML = '';
    }

    // Inject dynamic options based on tool
    const optionsContainer = document.getElementById('tool-options');
    optionsContainer.innerHTML = '';
    optionsContainer.classList.add('hidden');

    if (tool.id === 'split') {
        optionsContainer.innerHTML = `
            <div class="form-group" style="max-width: 380px; margin: 0 auto; text-align: left;">
                <label>Split mode</label>
                <div class="form-control" style="padding: 12px 14px; display: flex; align-items: center; gap: 10px;">
                    <input type="checkbox" id="split-as-zip" />
                    <span>Extract every page into a ZIP archive</span>
                </div>
                <input type="text" id="tool-range" class="form-control" style="margin-top: 10px;" placeholder="e.g. 2-5" />
                <small style="color: var(--text-muted);">Leave blank to split the full document or enter a custom range.</small>
            </div>
        `;
        optionsContainer.classList.remove('hidden');
    } else if (tool.id === 'delete') {
        optionsContainer.innerHTML = `
            <div class="form-group" style="max-width: 300px; margin: 0 auto;">
                <label>Pages to Delete</label>
                <input type="text" id="tool-range" class="form-control" placeholder="e.g. 2,4-5" />
                <small style="color: var(--text-muted);">Click pages below to select, or type a range above.</small>
                <div style="display: flex; gap: 8px; margin-top: 10px;">
                    <button id="delete-select-all" type="button" class="btn btn-outline" style="flex:1; font-size: 0.8rem;">Select All</button>
                    <button id="delete-deselect-all" type="button" class="btn btn-outline" style="flex:1; font-size: 0.8rem;">Deselect All</button>
                </div>
                <div id="delete-count" style="text-align:center; margin-top:8px; font-size:0.85rem; color: var(--primary);"></div>
            </div>
        `;
        optionsContainer.classList.remove('hidden');
        setTimeout(() => {
            const selectAllBtn = document.getElementById('delete-select-all');
            const deselectAllBtn = document.getElementById('delete-deselect-all');
            if (selectAllBtn) {
                selectAllBtn.addEventListener('click', () => {
                    if (currentPreviewFile) {
                        const total = selectedPageIndices.length || currentPreviewFile._pageCount || 0;
                        selectedPageIndices = Array.from({ length: total }, (_, i) => i);
                        renderPagePreviewGrid(currentPreviewFile);
                        updateDeleteCount();
                        updateDeleteRange();
                    }
                });
            }
            if (deselectAllBtn) {
                deselectAllBtn.addEventListener('click', () => {
                    selectedPageIndices = [];
                    renderPagePreviewGrid(currentPreviewFile);
                    updateDeleteCount();
                    updateDeleteRange();
                });
            }
        }, 0);
    } else if (tool.id === 'protect-pdf') {
        optionsContainer.innerHTML = `
            <div class="form-group" style="max-width: 300px; margin: 0 auto;">
                <label for="tool-password">🔐 Set Password</label>
                <input type="password" id="tool-password" class="form-control" placeholder="Enter secure password (min 4 chars)" />
                <small style="color: var(--text-muted);">Your PDF will require this password to open on all devices.</small>
            </div>
        `;
        optionsContainer.classList.remove('hidden');
    } else if (tool.id === 'unlock-pdf') {
        optionsContainer.innerHTML = `
            <div class="form-group" style="max-width: 300px; margin: 0 auto;">
                <div id="unlock-encryption-status" style="
                    padding: 10px 14px; border-radius: 10px; margin-bottom: 12px;
                    background: rgba(251, 191, 36, 0.08); border: 1px solid rgba(251, 191, 36, 0.25);
                    display: none; font-size: 0.85rem; text-align: center; color: var(--text-main);
                ">
                    🔍 Detecting encryption...
                </div>
                <label for="tool-password">🔓 Current Password</label>
                <input type="password" id="tool-password" class="form-control" placeholder="Enter password to unlock" />
                <small style="color: var(--text-muted);">Will create a new, unencrypted copy of your PDF.</small>
            </div>
        `;
        optionsContainer.classList.remove('hidden');
    } else if (tool.id === 'pdf-to-word') {
        optionsContainer.innerHTML = `
            <div class="form-group" style="max-width: 400px; margin: 0 auto; text-align: left;">
                <label>Conversion Mode</label>
                <div style="display: flex; gap: 12px; margin-top: 8px;">
                    <label class="pdf-word-mode" style="flex: 1; cursor: pointer;">
                        <input type="radio" name="pdf-word-mode" value="standard" checked style="display: none;">
                        <div class="pdf-word-mode-card" style="
                            padding: 16px 12px;
                            border: 2px solid var(--primary);
                            border-radius: 12px;
                            text-align: center;
                            background: rgba(14, 165, 233, 0.05);
                            transition: all 0.2s;
                        ">
                            <div style="font-weight: 600; margin-bottom: 4px;">📄 Standard</div>
                            <div style="font-size: 0.8rem; color: var(--text-muted);">Text extraction</div>
                        </div>
                    </label>
                    <label class="pdf-word-mode" style="flex: 1; cursor: pointer;">
                        <input type="radio" name="pdf-word-mode" value="ocr" style="display: none;">
                        <div class="pdf-word-mode-card" style="
                            padding: 16px 12px;
                            border: 2px solid var(--border);
                            border-radius: 12px;
                            text-align: center;
                            transition: all 0.2s;
                        ">
                            <div style="font-weight: 600; margin-bottom: 4px;">🔍 Advanced OCR</div>
                            <div style="font-size: 0.8rem; color: var(--text-muted);">Scanned docs</div>
                        </div>
                    </label>
                </div>
                <p id="pdf-word-mode-desc" style="color: var(--text-muted); font-size: 0.85rem; margin-top: 10px; text-align: center;">
                    Extracts text layer directly. Best for native PDFs with selectable text.
                </p>
            </div>
        `;
        optionsContainer.classList.remove('hidden');
        setTimeout(() => {
            document.querySelectorAll('.pdf-word-mode').forEach(opt => {
                opt.addEventListener('click', () => {
                    document.querySelectorAll('.pdf-word-mode input').forEach(r => r.checked = false);
                    opt.querySelector('input').checked = true;
                    document.querySelectorAll('.pdf-word-mode-card').forEach(card => {
                        card.style.borderColor = 'var(--border)';
                        card.style.background = 'transparent';
                    });
                    const card = opt.querySelector('.pdf-word-mode-card');
                    card.style.borderColor = 'var(--primary)';
                    card.style.background = 'rgba(14, 165, 233, 0.05)';
                    const modeDesc = document.getElementById('pdf-word-mode-desc');
                    if (modeDesc) {
                        const val = opt.querySelector('input').value;
                        modeDesc.textContent = val === 'ocr'
                            ? 'Forces image-based OCR on every page. Best for scanned documents or garbled text.'
                            : 'Extracts text layer directly. Best for native PDFs with selectable text.';
                    }
                });
            });
        }, 0);
    } else if (tool.id === 'word-to-pdf') {
        optionsContainer.innerHTML = `
            <div class="form-group" style="max-width: 300px; margin: 0 auto;">
                <label>📝 Convert Word to PDF</label>
                <p style="color: var(--text-muted); font-size: 0.9rem;">Converts your .docx document to professional PDF format</p>
            </div>
        `;
        optionsContainer.classList.remove('hidden');
    } else if (tool.id === 'jpg-to-pdf') {
        optionsContainer.innerHTML = `
            <div class="form-group" style="max-width: 400px; margin: 0 auto; text-align: left;">
                <label>Image to PDF Options</label>
                <div style="display: flex; gap: 12px; margin-bottom: 12px;">
                    <div style="flex: 1;">
                        <small style="color: var(--text-muted); font-weight: 500;">Page Orientation</small>
                        <select id="jpg-orientation" class="form-control" style="margin-top: 4px;">
                            <option value="portrait">Portrait</option>
                            <option value="landscape">Landscape</option>
                            <option value="auto">Auto-detect</option>
                        </select>
                    </div>
                    <div style="flex: 1;">
                        <small style="color: var(--text-muted); font-weight: 500;">Page Size</small>
                        <select id="jpg-page-size" class="form-control" style="margin-top: 4px;">
                            <option value="a4">A4</option>
                            <option value="letter">US Letter</option>
                            <option value="fit">Fit to image</option>
                        </select>
                    </div>
                </div>
                <div class="form-control" style="padding: 12px 14px; display: flex; align-items: center; gap: 10px;">
                    <input type="checkbox" id="jpg-separate" />
                    <span>Save each image as a separate PDF</span>
                </div>
            </div>
        `;
        optionsContainer.classList.remove('hidden');
    } else if (tool.id === 'watermark') {
        optionsContainer.innerHTML = `
            <div class="form-group" style="max-width: 300px; margin: 0 auto;">
                <label>Watermark Text</label>
                <input type="text" id="tool-watermark" class="form-control" placeholder="CONFIDENTIAL" value="CONFIDENTIAL">
            </div>
        `;
        optionsContainer.classList.remove('hidden');
    } else if (tool.id === 'compress') {
        optionsContainer.innerHTML = `
            <div class="form-group" style="max-width: 400px; margin: 0 auto; text-align: left;">
                <label>Compression Level</label>
                <div class="compress-options" style="display: flex; gap: 12px; margin-top: 8px;">
                    <label class="compress-option" style="flex: 1; cursor: pointer;">
                        <input type="radio" name="compress-level" value="low" style="display: none;">
                        <div class="compress-option-card" style="
                            padding: 16px 12px;
                            border: 2px solid var(--border);
                            border-radius: 12px;
                            text-align: center;
                            transition: all 0.2s;
                        ">
                            <div style="font-weight: 600; margin-bottom: 4px;">Low</div>
                            <div style="font-size: 0.8rem; color: var(--text-muted);">High quality</div>
                        </div>
                    </label>
                    <label class="compress-option" style="flex: 1; cursor: pointer;">
                        <input type="radio" name="compress-level" value="medium" checked style="display: none;">
                        <div class="compress-option-card" style="
                            padding: 16px 12px;
                            border: 2px solid var(--primary);
                            border-radius: 12px;
                            text-align: center;
                            background: rgba(14, 165, 233, 0.05);
                            transition: all 0.2s;
                        ">
                            <div style="font-weight: 600; margin-bottom: 4px;">Medium</div>
                            <div style="font-size: 0.8rem; color: var(--text-muted);">Recommended</div>
                        </div>
                    </label>
                    <label class="compress-option" style="flex: 1; cursor: pointer;">
                        <input type="radio" name="compress-level" value="strong" style="display: none;">
                        <div class="compress-option-card" style="
                            padding: 16px 12px;
                            border: 2px solid var(--border);
                            border-radius: 12px;
                            text-align: center;
                            transition: all 0.2s;
                        ">
                            <div style="font-weight: 600; margin-bottom: 4px;">Strong</div>
                            <div style="font-size: 0.8rem; color: var(--text-muted);">Smallest size</div>
                        </div>
                    </label>
                </div>
            </div>
        `;
        optionsContainer.classList.remove('hidden');

        // Add click handlers for compress options
        setTimeout(() => {
            document.querySelectorAll('.compress-option').forEach(opt => {
                opt.addEventListener('click', () => {
                    document.querySelectorAll('.compress-option input').forEach(r => r.checked = false);
                    opt.querySelector('input').checked = true;
                    document.querySelectorAll('.compress-option-card').forEach(card => {
                        card.style.borderColor = 'var(--border)';
                        card.style.background = 'transparent';
                    });
                    const card = opt.querySelector('.compress-option-card');
                    card.style.borderColor = 'var(--primary)';
                    card.style.background = 'rgba(14, 165, 233, 0.05)';
                });
            });
        }, 100);
    } else if (tool.id === 'rotate') {
        optionsContainer.innerHTML = `
            <div class="form-group" style="max-width: 300px; margin: 0 auto;">
                <label>Rotation Degrees</label>
                <select id="tool-rotation" class="form-control">
                    <option value="90">90° Clockwise</option>
                    <option value="180">180°</option>
                    <option value="270">90° Counter-Clockwise</option>
                </select>
            </div>
        `;
        optionsContainer.classList.remove('hidden');
    }
}

function showConversionNotice(message, type = 'warning') {
    const notice = document.getElementById('conversion-notice');
    if (!notice) return;

    notice.className = `conversion-notice ${type}`;
    notice.innerHTML = `<i data-lucide="${type === 'success' ? 'check-circle' : type === 'error' ? 'alert-circle' : 'alert-triangle'}"></i><span>${message}</span>`;
    notice.classList.remove('hidden');
    lucide.createIcons();
}

function hideConversionNotice() {
    const notice = document.getElementById('conversion-notice');
    if (!notice) return;
    notice.className = 'conversion-notice hidden';
    notice.innerHTML = '';
}

function resetWorkspace() {
    currentObjectUrls.forEach(url => URL.revokeObjectURL(url));
    currentObjectUrls = [];
    document.getElementById('file-list').classList.add('hidden');
    document.getElementById('file-list').innerHTML = '';
    document.getElementById('page-preview-grid').classList.add('hidden');
    document.getElementById('page-preview-grid').innerHTML = '';
    document.getElementById('process-btn').classList.add('hidden');
    document.getElementById('loading-indicator').classList.add('hidden');
    document.getElementById('file-dropzone').classList.remove('hidden');
    document.getElementById('result-screen').classList.add('hidden');
    selectedPageIndices = [];
    currentPreviewFile = null;
    resetPageRotations();
    hideConversionNotice();
}

function setupDropzone() {
    const dropzone = document.getElementById('file-dropzone');
    const fileInput = document.getElementById('file-input');

    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            handleFiles(e.dataTransfer.files);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleFiles(e.target.files);
        }
    });

    document.getElementById("process-btn").addEventListener("click", async () => {
        if (!currentTool) return;
        
        if (!selectedFiles || !selectedFiles.length) {
            if (typeof showConversionNotice === 'function') {
                showConversionNotice("Please select a file first.", "error");
            } else {
                alert("Please select a file first.");
            }
            return;
        }

        try {
            const file = selectedFiles[0];
            const isWordFile = file.name.toLowerCase().endsWith('.docx') || file.name.toLowerCase().endsWith('.doc');
            const isPdfFile = file.name.toLowerCase().endsWith('.pdf') || file.type.includes('pdf');

            const newTools = ['word-to-pdf', 'pdf-to-word', 'protect-pdf', 'unlock-pdf'];

            if (newTools.includes(currentTool.id)) {
                if (typeof window.processConversion === 'function') {
                    await window.processConversion(currentTool, selectedFiles);
                } else if (currentTool.id === 'word-to-pdf' && typeof window.convertWordToPdf === 'function') {
                    const blob = await window.convertWordToPdf(file);
                    if (blob && typeof window.showResultScreen === 'function') {
                        window.showResultScreen(file.name.replace(/\.docx?$/i, '.pdf') || 'converted.pdf', blob);
                    } else if (blob) {
                        const outputFilename = file.name.replace(/\.docx?$/i, '.pdf') || 'converted.pdf';
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = outputFilename;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                    }
                } else if (currentTool.id === 'word-to-pdf' && isWordFile) {
                    if (typeof showLoading === 'function') showLoading('Converting Word to PDF...');
                    const arrayBuffer = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = e => resolve(e.target.result);
                        reader.onerror = () => reject(new Error('Failed to read the file.'));
                        reader.readAsArrayBuffer(file);
                    });

                    if (typeof window.convertWordToPDF !== 'function' && typeof convertWordToPDF !== 'function') {
                        throw new Error('convertWordToPDF function is missing from pdf-tools.js');
                    }

                    const pdfBlob = typeof convertWordToPDF === 'function'
                        ? await convertWordToPDF(arrayBuffer)
                        : await window.convertWordToPDF(arrayBuffer);

                    const outputFilename = file.name.replace(/\.docx?$/i, '.pdf') || 'converted.pdf';
                    const url = URL.createObjectURL(pdfBlob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = outputFilename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);

                    if (typeof showToast === 'function') showToast('Conversion successful!', 'success');
                } else {
                    throw new Error(`Tool ${currentTool.id} handler is missing.`);
                }
            } else {
                // Path B: Legacy PDF Tools
                if (typeof window.processPDF === 'function') {
                    await window.processPDF(currentTool.id, selectedFiles);
                } else {
                    throw new Error('window.processPDF is not defined. Ensure legacy PDF logic is intact.');
                }
            }
        } catch (error) {
            console.error('Process Error:', error);
            if (typeof showToast === 'function') {
                showToast('Error: ' + error.message, 'error');
            } else {
                alert('Error: ' + error.message);
            }
        } finally {
            if (typeof hideLoading === 'function') hideLoading();
        }
    });
}

function getFileTypeIcon(file) {
    const name = (file?.name || '').toLowerCase();
    if (name.endsWith('.pdf')) return 'file-text';
    if (name.endsWith('.docx') || name.endsWith('.doc')) return 'file-plus-2';
    if (file?.type?.startsWith('image/')) return 'image';
    return 'file';
}

function formatFileSize(size) {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function handleFiles(files) {
    if (!currentTool) {
        alert('Please select a tool before uploading files.');
        return;
    }

    let validFiles = [];

    if (currentTool.id === 'jpg-to-pdf') {
        validFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    } else if (currentTool.id === 'word-to-pdf') {
        validFiles = Array.from(files).filter(file =>
            file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            file.type === 'application/msword' ||
            file.name.endsWith('.docx') ||
            file.name.endsWith('.doc')
        );
    } else if (currentTool.id === 'pdf-to-word' || currentTool.id === 'protect-pdf' || currentTool.id === 'unlock-pdf' || currentTool.id === 'merge') {
        validFiles = Array.from(files).filter(file => file.type === 'application/pdf' || file.name.endsWith('.pdf'));
    } else {
        validFiles = Array.from(files).filter(file => file.type === 'application/pdf' || file.name.endsWith('.pdf'));
    }

    if (validFiles.length === 0) {
        alert('Please upload a valid file format for this tool.');
        return;
    }

    if (currentTool.id === 'merge' || currentTool.id === 'jpg-to-pdf') {
        selectedFiles = validFiles;
    } else {
        selectedFiles = [validFiles[0]];
    }

    selectedPageIndices = [];
    updateFileListUI();

    // Auto-detect encryption for unlock tool
    if (currentTool.id === 'unlock-pdf' && selectedFiles[0]) {
        detectEncryption(selectedFiles[0]);
    }
}

async function detectEncryption(file) {
    const statusEl = document.getElementById('unlock-encryption-status');
    if (!statusEl) return;
    statusEl.style.display = 'block';
    statusEl.innerHTML = '🔍 Detecting encryption...';
    statusEl.style.background = 'rgba(251, 191, 36, 0.08)';
    statusEl.style.borderColor = 'rgba(251, 191, 36, 0.25)';

    try {
        const buffer = await file.arrayBuffer();
        const uint8 = new Uint8Array(buffer);
        // Try loading without password first
        const { PDFDocument } = await import('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm');
        let encrypted = false;
        let passwordNeeded = false;

        try {
            // Check if PDF requires password by looking at the encryption dictionary
            const pdfBytes = new Uint8Array(buffer);
            const pdfStr = new TextDecoder('latin1').decode(pdfBytes.slice(0, 2048));

            // Simple heuristic: look for encryption markers in the raw bytes
            if (pdfStr.includes('/Encrypt') || pdfStr.includes('/U ') || pdfStr.includes('/O ')) {
                encrypted = true;
                // Try loading with empty password to confirm
                try {
                    const testDoc = await PDFDocument.load(uint8, { ignoreEncryption: false });
                    // If it loads without error, it's not actually encrypted or has no user password
                    passwordNeeded = false;
                } catch (e) {
                    passwordNeeded = true;
                }
            }
        } catch (e) {
            // If detection fails, assume not encrypted
            encrypted = false;
        }

        if (encrypted && passwordNeeded) {
            statusEl.innerHTML = '🔒 This PDF is password-protected. Enter the password below to unlock it.';
            statusEl.style.background = 'rgba(239, 68, 68, 0.08)';
            statusEl.style.borderColor = 'rgba(239, 68, 68, 0.25)';
        } else if (encrypted) {
            statusEl.innerHTML = '🔓 This PDF has encryption but no user password. You can unlock it directly.';
            statusEl.style.background = 'rgba(14, 165, 233, 0.08)';
            statusEl.style.borderColor = 'rgba(14, 165, 233, 0.25)';
        } else {
            statusEl.innerHTML = '✅ This PDF does not appear to be password-protected.';
            statusEl.style.background = 'rgba(34, 197, 94, 0.08)';
            statusEl.style.borderColor = 'rgba(34, 197, 94, 0.25)';
        }
    } catch (e) {
        statusEl.innerHTML = '⚠️ Could not detect encryption status. Try entering the password if you know it.';
        statusEl.style.background = 'rgba(251, 191, 36, 0.08)';
        statusEl.style.borderColor = 'rgba(251, 191, 36, 0.25)';
    }
}

async function renderPagePreviewGrid(file) {
    const grid = document.getElementById('page-preview-grid');
    if (!grid || !file || !['split', 'delete', 'compress', 'pdf-to-jpg', 'rotate'].includes(currentTool?.id)) {
        if (grid) {
            grid.classList.add('hidden');
            grid.innerHTML = '';
        }
        return;
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
        grid.classList.add('hidden');
        grid.innerHTML = '';
        return;
    }

    grid.classList.remove('hidden');
    grid.innerHTML = '<div class="page-preview-card"><div class="page-thumb">Loading…</div></div>';
    currentPreviewFile = file;

    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const count = pdfDoc.numPages;
        file._pageCount = count;
        const cards = [];

        if (currentTool.id === 'delete') {
            selectedPageIndices = selectedPageIndices.length ? selectedPageIndices : Array.from({ length: count }, (_, index) => index);
        }

        if (currentTool.id === 'rotate') {
            for (let i = 1; i <= count; i++) {
                if (!(i in pageRotations)) pageRotations[i] = 0;
            }
        }

        for (let pageNumber = 1; pageNumber <= count; pageNumber += 1) {
            const page = await pdfDoc.getPage(pageNumber);
            const viewport = page.getViewport({ scale: 0.22 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const context = canvas.getContext('2d');
            await page.render({ canvasContext: context, viewport }).promise;
            const active = currentTool.id === 'delete' ? selectedPageIndices.includes(pageNumber - 1) : true;

            if (currentTool.id === 'rotate') {
                const rot = pageRotations[pageNumber] || 0;
                cards.push(`
                    <div class="page-preview-card active" data-page-number="${pageNumber}" style="position: relative;">
                        <div class="page-number">Page ${pageNumber} <span style="font-size: 0.7rem; color: var(--primary);">(${rot}°)</span></div>
                        <div class="page-thumb" style="transform: rotate(${rot}deg); transition: transform 0.3s;"><img src="${canvas.toDataURL('image/png')}" alt="Page ${pageNumber}" /></div>
                        <div class="page-rotate-controls" style="display: flex; justify-content: center; gap: 4px; margin-top: 8px;">
                            <button class="page-rotate-btn" data-page="${pageNumber}" data-dir="-90" type="button" style="
                                padding: 4px 8px; font-size: 0.75rem; border: 1px solid var(--border); border-radius: 6px; background: white; cursor: pointer; color: var(--text-main);
                            " title="Rotate Left">↺</button>
                            <button class="page-rotate-btn" data-page="${pageNumber}" data-dir="90" type="button" style="
                                padding: 4px 8px; font-size: 0.75rem; border: 1px solid var(--border); border-radius: 6px; background: white; cursor: pointer; color: var(--text-main);
                            " title="Rotate Right">↻</button>
                        </div>
                    </div>
                `);
            } else if (currentTool.id === 'split') {
                // Split: show scissors between pages
                cards.push(`
                    <div class="page-preview-card active" data-page-number="${pageNumber}" style="position: relative;">
                        <div class="page-number">Page ${pageNumber}</div>
                        <div class="page-thumb"><img src="${canvas.toDataURL('image/png')}" alt="Page ${pageNumber}" /></div>
                    </div>
                `);
                if (pageNumber < count) {
                    cards.push(`
                        <div class="split-scissors" data-after="${pageNumber}" style="
                            display: flex; align-items: center; justify-content: center;
                            cursor: pointer; padding: 4px; border-radius: 8px;
                            transition: all 0.2s; color: var(--text-muted);
                        " title="Click to split here">
                            <span style="font-size: 1.2rem;">✂️</span>
                        </div>
                    `);
                }
            } else {
                cards.push(`
                    <button class="page-preview-card ${active ? 'active' : ''}" data-page-number="${pageNumber}" type="button" style="position:relative;">
                        <div class="page-number">Page ${pageNumber}</div>
                        <div class="page-thumb"><img src="${canvas.toDataURL('image/png')}" alt="Page ${pageNumber}" /></div>
                        ${currentTool.id === 'delete' ? `<div class="delete-page-overlay ${active ? '' : 'selected'}" style="
                            position:absolute; top:0; left:0; right:0; bottom:0;
                            display:flex; align-items:center; justify-content:center;
                            border-radius:12px; pointer-events:none;
                            transition: background 0.2s;
                            ${active ? 'background: rgba(239,68,68,0.12);' : 'background: rgba(239,68,68,0.25);'}
                        ">
                            <span style="font-size:2rem; color:#ef4444; text-shadow: 0 1px 3px rgba(0,0,0,0.2);">${active ? '' : '✕'}</span>
                        </div>` : ''}
                    </button>
                `);
            }
        }

        grid.innerHTML = cards.join('');

        if (currentTool.id === 'rotate') {
            grid.querySelectorAll('.page-rotate-btn').forEach((btn) => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const pageNum = Number(btn.getAttribute('data-page'));
                    const dir = Number(btn.getAttribute('data-dir'));
                    pageRotations[pageNum] = ((pageRotations[pageNum] || 0) + dir + 360) % 360;
                    renderPagePreviewGrid(currentPreviewFile);
                });
            });
        } else if (currentTool.id === 'split') {
            grid.querySelectorAll('.split-scissors').forEach((scissors) => {
                scissors.addEventListener('click', () => {
                    const afterPage = Number(scissors.getAttribute('data-after'));
                    if (splitPositions[afterPage]) {
                        delete splitPositions[afterPage];
                        scissors.style.background = 'transparent';
                        scissors.style.color = 'var(--text-muted)';
                    } else {
                        splitPositions[afterPage] = true;
                        scissors.style.background = 'rgba(14, 165, 233, 0.1)';
                        scissors.style.color = 'var(--primary)';
                    }
                    // Update range input based on split positions
                    updateSplitRange();
                });
                scissors.addEventListener('mouseenter', () => {
                    scissors.style.background = 'rgba(14, 165, 233, 0.05)';
                });
                scissors.addEventListener('mouseleave', () => {
                    if (!splitPositions[scissors.getAttribute('data-after')]) {
                        scissors.style.background = 'transparent';
                    }
                });
            });
        } else {
            grid.querySelectorAll('.page-preview-card').forEach((card) => {
                card.addEventListener('click', () => {
                    if (currentTool.id !== 'delete') return;
                    const pageIndex = Number(card.getAttribute('data-page-number')) - 1;
                    if (selectedPageIndices.includes(pageIndex)) {
                        selectedPageIndices = selectedPageIndices.filter((item) => item !== pageIndex);
                    } else {
                        selectedPageIndices.push(pageIndex);
                    }
                    renderPagePreviewGrid(currentPreviewFile);
                    updateDeleteCount();
                    updateDeleteRange();
                });
            });
        }
    } catch (error) {
        grid.innerHTML = `<div class="page-preview-card"><div class="page-thumb">Preview unavailable</div></div>`;
    }
}

function updateDeleteCount() {
    const countEl = document.getElementById('delete-count');
    if (!countEl) return;
    const total = currentPreviewFile?._pageCount || selectedPageIndices.length;
    const selected = selectedPageIndices.length;
    if (selected === 0) {
        countEl.textContent = '';
    } else {
        countEl.textContent = `${selected} page${selected > 1 ? 's' : ''} selected for deletion`;
    }
}

function updateDeleteRange() {
    const rangeInput = document.getElementById('tool-range');
    if (!rangeInput || currentTool?.id !== 'delete') return;

    if (!currentPreviewFile) return;
    const total = currentPreviewFile._pageCount || 0;

    const pagesToDelete = [];
    for (let i = 0; i < total; i++) {
        if (!selectedPageIndices.includes(i)) {
            pagesToDelete.push(i + 1);
        }
    }
    rangeInput.value = pagesToDelete.join(', ');
}

function updateSplitRange() {
    const rangeInput = document.getElementById('tool-range');
    if (!rangeInput) return;

    const positions = Object.keys(splitPositions).map(Number).sort((a, b) => a - b);
    if (positions.length === 0) {
        rangeInput.value = '';
        return;
    }

    // Build range string from split positions
    const ranges = [];
    let start = 1;
    positions.forEach(pos => {
        if (start <= pos) {
            ranges.push(start === pos ? `${start}` : `${start}-${pos}`);
            start = pos + 1;
        }
    });
    // Add remaining pages
    const totalPages = currentPreviewFile ? parseInt(rangeInput.placeholder?.match(/\d+/)?.[0] || '999') : 999;
    if (start <= totalPages) {
        ranges.push(start === totalPages ? `${start}` : `${start}-${totalPages}`);
    }

    rangeInput.value = ranges.join(', ');
}

let currentObjectUrls = [];
let pageRotations = {};
let splitPositions = {};

window.pageRotations = pageRotations;

function resetPageRotations() {
    pageRotations = {};
    window.pageRotations = pageRotations;
}

function resetSplitPositions() {
    splitPositions = {};
}

function updateFileListUI() {
    const listEl = document.getElementById('file-list');
    const dropzone = document.getElementById('file-dropzone');
    const processBtn = document.getElementById('process-btn');
    const previewGrid = document.getElementById('page-preview-grid');

    currentObjectUrls.forEach(url => URL.revokeObjectURL(url));
    currentObjectUrls = [];

    dropzone.classList.add('hidden');
    listEl.classList.remove('hidden');
    processBtn.classList.remove('hidden');

    if (currentTool.id === 'jpg-to-pdf') {
        listEl.innerHTML = `
            <div class="image-grid">
                ${selectedFiles.map((file, index) => {
            const objUrl = URL.createObjectURL(file);
            currentObjectUrls.push(objUrl);
            return `
                    <div class="image-card" draggable="true" data-index="${index}">
                        <img src="${objUrl}" alt="${file.name}" />
                        <div class="image-name">${file.name}</div>
                    </div>
                    `;
        }).join('')}
            </div>
        `;
        const cards = listEl.querySelectorAll('.image-card');
        let dragIndex = null;
        cards.forEach((card) => {
            card.addEventListener('dragstart', (event) => {
                dragIndex = Number(event.currentTarget.getAttribute('data-index'));
            });
            card.addEventListener('dragover', (event) => event.preventDefault());
            card.addEventListener('drop', (event) => {
                event.preventDefault();
                const targetIndex = Number(event.currentTarget.getAttribute('data-index'));
                if (dragIndex === null || dragIndex === targetIndex) return;
                const reordered = [...selectedFiles];
                const [moved] = reordered.splice(dragIndex, 1);
                reordered.splice(targetIndex, 0, moved);
                selectedFiles = reordered;
                updateFileListUI();
            });
        });
        lucide.createIcons();
        return;
    }

    const html = selectedFiles.map((file, index) => `
        <div class="file-pill">
            <i data-lucide="${getFileTypeIcon(file)}" style="color: var(--primary);"></i>
            <div style="flex: 1;">
                <strong>${file.name}</strong>
                <small>${formatFileSize(file.size)}</small>
            </div>
            <span class="status-pill">${index + 1}</span>
        </div>
    `).join('');

    listEl.innerHTML = html;
    lucide.createIcons();

    if (selectedFiles[0]) {
        renderPagePreviewGrid(selectedFiles[0]);
    } else {
        previewGrid.classList.add('hidden');
        previewGrid.innerHTML = '';
    }
}

// Expose UI functions for pdf-tools.js to use
window.setProcessingState = function (isProcessing) {
    const btn = document.getElementById('process-btn');
    const loader = document.getElementById('loading-indicator');

    if (isProcessing) {
        btn.classList.add('hidden');
        loader.classList.remove('hidden');
    } else {
        btn.classList.remove('hidden');
        loader.classList.add('hidden');
    }
}

// Result Screen functionality
let currentResultBlob = null;
let currentResultFilename = '';

window.showResultScreen = function showResultScreen(filename, blob) {
    const resultScreen = document.getElementById('result-screen');
    const resultFilename = document.getElementById('result-filename');
    const resultDownloadBtn = document.getElementById('result-download-btn');
    const resultDeleteBtn = document.getElementById('result-delete-btn');
    const resultStartoverBtn = document.getElementById('result-startover-btn');
    const continueToolsGrid = document.getElementById('continue-tools-grid');

    currentResultBlob = blob;
    currentResultFilename = filename;

    resultFilename.textContent = filename;
    resultScreen.classList.remove('hidden');

    // Hide other elements
    document.getElementById('file-dropzone').classList.add('hidden');
    document.getElementById('file-list').classList.add('hidden');
    document.getElementById('tool-options').classList.add('hidden');
    document.getElementById('page-preview-grid').classList.add('hidden');
    document.getElementById('process-btn').classList.add('hidden');
    document.getElementById('loading-indicator').classList.add('hidden');

    // Populate continue tools
    continueToolsGrid.innerHTML = '';
    const relatedTools = getRelatedTools(currentTool?.id);
    relatedTools.forEach(tool => {
        const card = document.createElement('a');
        card.href = `#tool?id=${tool.id}`;
        card.className = 'continue-tool-card';
        card.innerHTML = `<i data-lucide="${tool.icon}"></i><span>${tool.title}</span>`;
        continueToolsGrid.appendChild(card);
    });
    lucide.createIcons();

    // Event listeners
    resultDownloadBtn.onclick = () => {
        if (currentResultBlob) {
            const url = URL.createObjectURL(currentResultBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = currentResultFilename;
            a.click();
            URL.revokeObjectURL(url);
        }
    };

    resultDeleteBtn.onclick = () => {
        currentResultBlob = null;
        currentResultFilename = '';
        resultScreen.classList.add('hidden');
        showToast('File deleted', 'success');
    };

    resultStartoverBtn.onclick = () => {
        currentResultBlob = null;
        currentResultFilename = '';
        resultScreen.classList.add('hidden');
        resetWorkspace();
    };
}

function getRelatedTools(toolId) {
    const related = {
        'merge': ['split', 'compress', 'delete'],
        'split': ['merge', 'compress', 'delete'],
        'compress': ['merge', 'split', 'pdf-to-word'],
        'rotate': ['delete', 'split', 'merge'],
        'delete': ['split', 'rotate', 'merge'],
        'watermark': ['protect-pdf', 'merge', 'compress'],
        'pdf-to-word': ['word-to-pdf', 'compress', 'merge'],
        'word-to-pdf': ['pdf-to-word', 'merge', 'compress'],
        'pdf-to-jpg': ['jpg-to-pdf', 'compress', 'merge'],
        'jpg-to-pdf': ['pdf-to-jpg', 'merge', 'compress'],
        'protect-pdf': ['unlock-pdf', 'merge', 'watermark'],
        'unlock-pdf': ['protect-pdf', 'merge', 'watermark']
    };

    const ids = related[toolId] || ['merge', 'split', 'compress'];
    return ids.map(id => tools.find(t => t.id === id)).filter(Boolean);
}

// Authentication Logic
let currentUser = null;

function initAuth() {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
        } catch (e) {
            currentUser = null;
        }
    }
    updateAuthUI();
    setupAuthEvents();
}

function updateAuthUI() {
    const navSigninBtn = document.getElementById('nav-signin-btn');
    const navUserMenu = document.getElementById('nav-user-menu');

    if (currentUser) {
        if (navSigninBtn) navSigninBtn.classList.add('hidden');
        if (navUserMenu) {
            navUserMenu.classList.remove('hidden');

            const avatarEl = document.getElementById('nav-user-avatar');
            const nameEl = document.getElementById('nav-user-name');
            const dropdownNameEl = document.getElementById('dropdown-user-name');
            const dropdownEmailEl = document.getElementById('dropdown-user-email');

            const displayName = currentUser.name || currentUser.email;
            if (nameEl) nameEl.textContent = displayName.split(' ')[0];
            if (dropdownNameEl) dropdownNameEl.textContent = displayName;
            if (dropdownEmailEl) dropdownEmailEl.textContent = currentUser.email;

            if (avatarEl) {
                avatarEl.textContent = displayName.charAt(0).toUpperCase();
            }
        }

        if (window.location.hash === '#auth') {
            window.location.hash = '#home';
        }
    } else {
        if (navSigninBtn) navSigninBtn.classList.remove('hidden');
        if (navUserMenu) navUserMenu.classList.add('hidden');
    }
}

function setupAuthEvents() {
    const userMenu = document.getElementById('nav-user-menu');
    const dropdown = document.getElementById('nav-user-dropdown');

    if (userMenu && dropdown) {
        userMenu.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('show');
        });

        document.addEventListener('click', () => {
            dropdown.classList.remove('show');
        });
    }

    const signoutBtn = document.getElementById('btn-signout');
    if (signoutBtn) {
        signoutBtn.addEventListener('click', (e) => {
            e.preventDefault();

            const loader = document.getElementById('global-loader');
            if (loader) {
                loader.classList.add('show');
            }

            setTimeout(() => {
                currentUser = null;
                localStorage.removeItem('currentUser');
                updateAuthUI();

                if (loader) {
                    loader.classList.remove('show');
                }

                showToast('Logged out successfully', 'success');
                window.location.hash = '#home';
            }, 2000);
        });
    }
    const signinContainer = document.getElementById('form-signin-container');
    const signupContainer = document.getElementById('form-signup-container');
    const forgotContainer = document.getElementById('form-forgot-container');

    const linkForgot = document.getElementById('link-forgot');
    const linkGotoSignup = document.getElementById('link-goto-signup');
    const linkGotoSignin = document.getElementById('link-goto-signin');
    const linkForgotGotoSignin = document.getElementById('link-forgot-goto-signin');

    const showPane = (paneToShow) => {
        [signinContainer, signupContainer, forgotContainer].forEach(el => {
            if (el) el.classList.add('hidden');
        });
        if (paneToShow) paneToShow.classList.remove('hidden');
    };

    if (linkForgot) {
        linkForgot.addEventListener('click', (e) => {
            e.preventDefault();
            showPane(forgotContainer);
        });
    }
    if (linkGotoSignup) {
        linkGotoSignup.addEventListener('click', (e) => {
            e.preventDefault();
            showPane(signupContainer);
        });
    }
    if (linkGotoSignin) {
        linkGotoSignin.addEventListener('click', (e) => {
            e.preventDefault();
            showPane(signinContainer);
        });
    }
    if (linkForgotGotoSignin) {
        linkForgotGotoSignin.addEventListener('click', (e) => {
            e.preventDefault();
            showPane(signinContainer);
        });
    }

    const formSignin = document.getElementById('form-signin');
    if (formSignin) {
        formSignin.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('signin-email').value.trim();
            const password = document.getElementById('signin-password').value;

            let users = [];
            const savedUsers = localStorage.getItem('registeredUsers');
            if (savedUsers) {
                try {
                    users = JSON.parse(savedUsers);
                } catch (err) { }
            }

            const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
            if (!user) {
                showToast('Account not found. Please create a new account first.', 'error');
                return;
            }

            if (user.password !== password) {
                showToast('Incorrect password.', 'error');
                return;
            }

            // Show loading overlay
            const overlay = document.getElementById('auth-loading-overlay');
            const overlayText = document.getElementById('loading-overlay-text');
            if (overlay && overlayText) {
                overlayText.textContent = "Signing you in securely...";
                overlay.classList.remove('hidden');
                void overlay.offsetWidth; // Force reflow
                overlay.classList.add('show');
            }

            // Disable inputs & add loading spinner
            const submitBtn = formSignin.querySelector('button[type="submit"]');
            const originalHtml = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<span class="spinner" style="width: 16px; height: 16px; border-width: 2px;"></span> Signing in...`;

            const inputs = formSignin.querySelectorAll('.form-control');
            inputs.forEach(input => input.disabled = true);

            setTimeout(() => {
                currentUser = { name: user.name, email: user.email };
                localStorage.setItem('currentUser', JSON.stringify(currentUser));
                updateAuthUI();
                showToast(`Welcome back, ${user.name}!`, 'success');
                window.location.hash = '#home';

                // Reset UI states
                if (overlay) {
                    overlay.classList.remove('show');
                    setTimeout(() => overlay.classList.add('hidden'), 300);
                }
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalHtml;
                inputs.forEach(input => input.disabled = false);
                formSignin.reset();
            }, 2000);
        });
    }

    const formSignup = document.getElementById('form-signup');
    if (formSignup) {
        formSignup.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = document.getElementById('signup-name').value.trim();
            const email = document.getElementById('signup-email').value.trim();
            const password = document.getElementById('signup-password').value;

            let users = [];
            const savedUsers = localStorage.getItem('registeredUsers');
            if (savedUsers) {
                try {
                    users = JSON.parse(savedUsers);
                } catch (err) { }
            }

            const exists = users.some(u => u.email.toLowerCase() === email.toLowerCase());
            if (exists) {
                showToast('Account already exists with this email', 'error');
                return;
            }

            // Show loading overlay
            const overlay = document.getElementById('auth-loading-overlay');
            const overlayText = document.getElementById('loading-overlay-text');
            if (overlay && overlayText) {
                overlayText.textContent = "Creating your account...";
                overlay.classList.remove('hidden');
                void overlay.offsetWidth; // Force reflow
                overlay.classList.add('show');
            }

            // Disable inputs & add loading spinner
            const submitBtn = formSignup.querySelector('button[type="submit"]');
            const originalHtml = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<span class="spinner" style="width: 16px; height: 16px; border-width: 2px;"></span> Registering...`;

            const inputs = formSignup.querySelectorAll('.form-control');
            inputs.forEach(input => input.disabled = true);
            const checkbox = document.getElementById('signup-terms');
            if (checkbox) checkbox.disabled = true;

            setTimeout(() => {
                users.push({ name, email, password });
                localStorage.setItem('registeredUsers', JSON.stringify(users));

                // Reset UI states
                if (overlay) {
                    overlay.classList.remove('show');
                    setTimeout(() => overlay.classList.add('hidden'), 300);
                }
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalHtml;
                inputs.forEach(input => input.disabled = false);
                if (checkbox) checkbox.disabled = false;
                formSignup.reset();

                showToast('Account created successfully! Please sign in.', 'success');
                showPane(signinContainer);
            }, 2000);
        });
    }

    const formForgot = document.getElementById('form-forgot');
    if (formForgot) {
        formForgot.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('forgot-email').value.trim();

            let users = [];
            const savedUsers = localStorage.getItem('registeredUsers');
            if (savedUsers) {
                try {
                    users = JSON.parse(savedUsers);
                } catch (err) { }
            }

            const userExists = users.some(u => u.email.toLowerCase() === email.toLowerCase());

            // Show loading overlay
            const overlay = document.getElementById('auth-loading-overlay');
            const overlayText = document.getElementById('loading-overlay-text');
            if (overlay && overlayText) {
                overlayText.textContent = "Verifying email address...";
                overlay.classList.remove('hidden');
                void overlay.offsetWidth;
                overlay.classList.add('show');
            }

            const submitBtn = formForgot.querySelector('button[type="submit"]');
            const originalHtml = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<span class="spinner" style="width: 16px; height: 16px; border-width: 2px;"></span> Processing...`;

            const emailInput = document.getElementById('forgot-email');
            emailInput.disabled = true;

            setTimeout(() => {
                // Reset loading overlay & button
                if (overlay) {
                    overlay.classList.remove('show');
                    setTimeout(() => overlay.classList.add('hidden'), 300);
                }
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalHtml;
                emailInput.disabled = false;

                if (userExists) {
                    showToast(`Password reset link sent to ${email}! (Mock)`, 'success');
                    formForgot.reset();
                    showPane(signinContainer);
                } else {
                    showToast('No account registered with this email.', 'error');
                }
            }, 2000);
        });
    }

    const googleModal = document.getElementById('google-modal');
    const googleClose = document.getElementById('google-modal-close');
    const btnGoogleSignin = document.getElementById('google-signin-btn');
    const btnGoogleSignup = document.getElementById('google-signup-btn');

    const openGoogleModal = () => {
        if (googleModal) googleModal.classList.add('show');
    };

    const closeGoogleModal = () => {
        if (googleModal) googleModal.classList.remove('show');
    };

    if (btnGoogleSignin) btnGoogleSignin.addEventListener('click', openGoogleModal);
    if (btnGoogleSignup) btnGoogleSignup.addEventListener('click', openGoogleModal);
    if (googleClose) googleClose.addEventListener('click', closeGoogleModal);

    const googleItems = document.querySelectorAll('.google-account-item');
    googleItems.forEach(item => {
        item.addEventListener('click', () => {
            const email = item.getAttribute('data-email');
            const name = item.getAttribute('data-name');

            closeGoogleModal();

            // Show loading overlay
            const overlay = document.getElementById('auth-loading-overlay');
            const overlayText = document.getElementById('loading-overlay-text');
            if (overlay && overlayText) {
                overlayText.textContent = "Authenticating with Google...";
                overlay.classList.remove('hidden');
                void overlay.offsetWidth; // Force reflow
                overlay.classList.add('show');
            }

            showToast('Authenticating with Google...', 'info');

            setTimeout(() => {
                currentUser = { name, email, provider: 'google' };
                localStorage.setItem('currentUser', JSON.stringify(currentUser));
                updateAuthUI();

                // Reset overlay
                if (overlay) {
                    overlay.classList.remove('show');
                    setTimeout(() => overlay.classList.add('hidden'), 300);
                }
                showToast(`Signed in with Google as ${name}`, 'success');
                window.location.hash = '#home';
            }, 2000);
        });
    });
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconName = 'check-circle';
    if (type === 'error') iconName = 'alert-triangle';
    if (type === 'info') iconName = 'info';

    toast.innerHTML = `
        <i data-lucide="${iconName}"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);
    lucide.createIcons();

    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3500);
}
