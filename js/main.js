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
                <small style="color: var(--text-muted);">Use commas and ranges to remove pages.</small>
            </div>
        `;
        optionsContainer.classList.remove('hidden');
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
                <label for="tool-password">🔓 Current Password</label>
                <input type="password" id="tool-password" class="form-control" placeholder="Enter password to unlock" />
                <small style="color: var(--text-muted);">Will create a new, unencrypted copy of your PDF.</small>
            </div>
        `;
        optionsContainer.classList.remove('hidden');
    } else if (tool.id === 'pdf-to-word') {
        optionsContainer.innerHTML = `
            <div class="form-group" style="max-width: 380px; margin: 0 auto; text-align: left;">
                <label>📄 Convert PDF to Word</label>
                <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 14px;">
                    Uses PDF text extraction and automatic OCR fallback for scanned pages.
                    Arabic documents with broken font mappings are detected and re-read via OCR automatically.
                </p>
                <div class="force-ocr-toggle-row" style="
                    display: flex;
                    align-items: flex-start;
                    gap: 12px;
                    padding: 12px 14px;
                    background: var(--surface, rgba(255,255,255,0.04));
                    border: 1px solid var(--border, rgba(255,255,255,0.1));
                    border-radius: 10px;
                    cursor: pointer;
                " onclick="document.getElementById('force-ocr-toggle').click()">
                    <div style="padding-top: 2px; flex-shrink: 0;">
                        <input
                            type="checkbox"
                            id="force-ocr-toggle"
                            style="width: 17px; height: 17px; cursor: pointer; accent-color: var(--primary, #6366f1);"
                            onclick="event.stopPropagation()"
                        />
                    </div>
                    <div>
                        <strong style="display: block; font-size: 0.9rem; margin-bottom: 2px;">🔍 Force OCR for this file</strong>
                        <small style="color: var(--text-muted); font-size: 0.8rem; line-height: 1.4;">
                            Enable when the extracted text looks garbled or mixed up.
                            All pages will be scanned as images and read by OCR instead of using the PDF text layer.
                        </small>
                    </div>
                </div>
            </div>
        `;
        optionsContainer.classList.remove('hidden');
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
            <div class="form-group" style="max-width: 320px; margin: 0 auto; text-align: left;">
                <label>🖼️ Arrange images</label>
                <p style="color: var(--text-muted); font-size: 0.9rem;">Drag the thumbnails to reorder them before generating a combined PDF.</p>
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
    selectedPageIndices = [];
    currentPreviewFile = null;
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

    document.getElementById('process-btn').addEventListener('click', () => {
        if (selectedFiles.length > 0 && currentTool) {
            // Use new conversion handler for document converters and encryption tools
            if (['pdf-to-word', 'word-to-pdf', 'protect-pdf', 'unlock-pdf'].includes(currentTool.id)) {
                window.processConversion(currentTool);
            } else {
                // Use legacy PDF processor for other tools
                window.processPDF(currentTool.id, selectedFiles);
            }
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
}

async function renderPagePreviewGrid(file) {
    const grid = document.getElementById('page-preview-grid');
    if (!grid || !file || !['split', 'delete', 'compress', 'pdf-to-jpg'].includes(currentTool?.id)) {
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
        const cards = [];

        if (currentTool.id === 'delete') {
            selectedPageIndices = selectedPageIndices.length ? selectedPageIndices : Array.from({ length: count }, (_, index) => index);
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
            cards.push(`
                <button class="page-preview-card ${active ? 'active' : ''}" data-page-number="${pageNumber}" type="button">
                    <div class="page-number">Page ${pageNumber}</div>
                    <div class="page-thumb"><img src="${canvas.toDataURL('image/png')}" alt="Page ${pageNumber}" /></div>
                </button>
            `);
        }

        grid.innerHTML = cards.join('');
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
            });
        });
    } catch (error) {
        grid.innerHTML = `<div class="page-preview-card"><div class="page-thumb">Preview unavailable</div></div>`;
    }
}

let currentObjectUrls = [];

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
window.setProcessingState = function(isProcessing) {
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
                } catch (err) {}
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
                } catch (err) {}
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
                } catch (err) {}
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
