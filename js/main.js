const tools = [
    { id: 'merge', title: 'Merge PDF', icon: 'files', desc: 'Combine multiple PDFs into one unified document.' },
    { id: 'split', title: 'Split PDF', icon: 'file-minus', desc: 'Separate one page or a whole set for easy conversion into independent PDF files.' },
    { id: 'compress', title: 'Compress PDF', icon: 'minimize', desc: 'Reduce file size while optimizing for maximal PDF quality.' },
    { id: 'pdf-to-word', title: 'PDF to Word', icon: 'file-text', desc: 'Convert your PDFs to Word documents. (Mock)' },
    { id: 'word-to-pdf', title: 'Word to PDF', icon: 'file', desc: 'Make DOC files easy to read by converting them to PDF. (Mock)' },
    { id: 'pdf-to-jpg', title: 'PDF to JPG', icon: 'image', desc: 'Convert each PDF page into a JPG image.' },
    { id: 'jpg-to-pdf', title: 'JPG to PDF', icon: 'image', desc: 'Convert JPG images to PDF in seconds.' },
    { id: 'rotate', title: 'Rotate PDF', icon: 'rotate-cw', desc: 'Rotate your PDFs the way you need them.' },
    { id: 'delete', title: 'Delete Pages', icon: 'trash-2', desc: 'Remove pages from a PDF document.' },
    { id: 'protect', title: 'Protect PDF', icon: 'lock', desc: 'Protect PDF files with a password.' },
    { id: 'unlock', title: 'Unlock PDF', icon: 'unlock', desc: 'Remove PDF password security.' },
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
            <div class="form-group" style="max-width: 300px; margin: 0 auto;">
                <label>Page Range</label>
                <input type="text" id="tool-range" class="form-control" placeholder="e.g. 1-3,5" />
                <small style="color: var(--text-muted);">Leave blank to keep all pages.</small>
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
    } else if (tool.id === 'protect') {
        optionsContainer.innerHTML = `
            <div class="form-group" style="max-width: 300px; margin: 0 auto;">
                <label>Set Password</label>
                <input type="password" id="tool-password" class="form-control" placeholder="Enter secure password">
                <small style="color: var(--text-muted);">Browser-only encryption is not supported in this build.</small>
            </div>
        `;
        optionsContainer.classList.remove('hidden');
    } else if (tool.id === 'unlock') {
        optionsContainer.innerHTML = `
            <div class="form-group" style="max-width: 300px; margin: 0 auto;">
                <label>Current Password</label>
                <input type="password" id="tool-password" class="form-control" placeholder="Enter password to unlock">
                <small style="color: var(--text-muted);">This will try to open the PDF if it is encrypted.</small>
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

function resetWorkspace() {
    document.getElementById('file-list').classList.add('hidden');
    document.getElementById('file-list').innerHTML = '';
    document.getElementById('process-btn').classList.add('hidden');
    document.getElementById('loading-indicator').classList.add('hidden');
    document.getElementById('file-dropzone').classList.remove('hidden');
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
            // Trigger processing from pdf-tools.js
            window.processPDF(currentTool.id, selectedFiles);
        }
    });
}

function handleFiles(files) {
    if (!currentTool) {
        alert('Please select a tool before uploading files.');
        return;
    }

    // Validate file types by tool
    const validFiles = Array.from(files).filter(file => {
        if (currentTool.id === 'jpg-to-pdf') {
            return file.type.startsWith('image/');
        }
        return file.type === 'application/pdf';
    });
    
    if (validFiles.length === 0) {
        alert('Please upload a valid file format for this tool.');
        return;
    }
    
    if (currentTool.id === 'merge' || currentTool.id === 'jpg-to-pdf') {
        selectedFiles = validFiles;
    } else {
        selectedFiles = [validFiles[0]];
    }
    
    updateFileListUI();
}

function updateFileListUI() {
    const listEl = document.getElementById('file-list');
    const dropzone = document.getElementById('file-dropzone');
    const processBtn = document.getElementById('process-btn');
    
    dropzone.classList.add('hidden');
    listEl.classList.remove('hidden');
    processBtn.classList.remove('hidden');
    
    let html = '';
    selectedFiles.forEach(file => {
        html += `
            <div class="file-info">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <i data-lucide="file" style="color: var(--primary);"></i>
                    <strong>${file.name}</strong>
                    <span style="color: var(--text-muted); font-size: 0.85rem;">(${(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                </div>
            </div>
        `;
    });
    
    // Add "add more files" button if tool is merge
    if (currentTool.id === 'merge') {
        html += `
            <div style="margin-top: 16px; text-align: center;">
                <button class="btn" style="background-color: var(--card-bg); color: var(--primary); border: 1px solid var(--primary);" onclick="document.getElementById('file-input').click()">
                    + Add More Files
                </button>
            </div>
        `;
    }
    
    listEl.innerHTML = html;
    lucide.createIcons();
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
