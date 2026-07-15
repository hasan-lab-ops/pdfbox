// App State
const state = {
    mergeFiles: [],
    splitFile: null,
    imageFiles: [],
    pdf2wordFile: null,
    word2pdfFile: null,
    compressFile: null,
    protectFile: null,
    unlockFile: null,
    watermarkFile: null,
    deleteFile: null
};

// DOM Elements
const navItems = document.querySelectorAll('.nav-item');
const sections = document.querySelectorAll('.tool-section');
const statusOverlay = document.getElementById('status-overlay');
const statusText = document.getElementById('status-text');
const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');
const progressPercentage = document.getElementById('progress-percentage');

// Navigation
navItems.forEach(item => {
    item.addEventListener('click', () => {
        navItems.forEach(nav => nav.classList.remove('active'));
        sections.forEach(sec => sec.classList.remove('active-section'));

        item.classList.add('active');
        const targetId = item.getAttribute('data-target');
        document.getElementById(targetId).classList.add('active-section');
    });
});

// Helper functions for UI
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

window.showStatus = function(message) {
    statusText.textContent = message;
    statusOverlay.classList.remove('hidden');
    if(progressContainer) progressContainer.classList.add('hidden');
    if(progressPercentage) progressPercentage.classList.add('hidden');
}

window.updateProgress = function(percentage, message) {
    statusOverlay.classList.remove('hidden');
    if(progressContainer) progressContainer.classList.remove('hidden');
    if(progressPercentage) progressPercentage.classList.remove('hidden');
    statusText.textContent = message || 'Processing...';
    if(progressBar) progressBar.style.width = percentage + '%';
    if(progressPercentage) progressPercentage.textContent = Math.round(percentage) + '%';
}

window.hideStatus = function() {
    statusOverlay.classList.add('hidden');
}

function setupDragAndDrop(dropZoneId, inputId, onFiles) {
    const dropZone = document.getElementById(dropZoneId);
    const input = document.getElementById(inputId);

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            onFiles(Array.from(e.dataTransfer.files));
        }
    });

    input.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            onFiles(Array.from(e.target.files));
        }
    });
}

function setupSingleFileUI(dropId, inputId, stateKey, expectedType, optionsId, fileInfoId, btnId, onFileSelected = null) {
    setupDragAndDrop(dropId, inputId, (files) => {
        let validFiles = files;
        if (expectedType === 'application/pdf') {
            validFiles = files.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
        } else if (expectedType === '.docx') {
            validFiles = files.filter(f => f.name.toLowerCase().endsWith('.docx') || f.type.includes('wordprocessingml'));
        }
        
        if (validFiles.length > 0) {
            state[stateKey] = validFiles[0];
            const optionsPanel = document.getElementById(optionsId);
            const fileInfo = document.getElementById(fileInfoId);
            const btn = document.getElementById(btnId);

            optionsPanel.classList.remove('hidden');
            fileInfo.textContent = `Selected: ${state[stateKey].name} (${formatBytes(state[stateKey].size)})`;
            btn.disabled = false;
            
            if (onFileSelected) onFileSelected(state[stateKey]);
        }
    });
}

// ---------------- Merge PDFs ----------------
setupDragAndDrop('merge-drop-zone', 'merge-input', (files) => {
    const pdfFiles = files.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    state.mergeFiles = [...state.mergeFiles, ...pdfFiles];
    renderMergeList();
});

function renderMergeList() {
    const list = document.getElementById('merge-file-list');
    const btn = document.getElementById('merge-btn');
    list.innerHTML = '';
    
    state.mergeFiles.forEach((file, index) => {
        const li = document.createElement('li');
        li.className = 'file-item';
        li.innerHTML = `
            <div class="file-name">
                <i class="fa-solid fa-file-pdf"></i>
                <span>${file.name} <small>(${formatBytes(file.size)})</small></span>
            </div>
            <button class="remove-btn" onclick="removeMergeFile(${index})"><i class="fa-solid fa-xmark"></i></button>
        `;
        list.appendChild(li);
    });
    btn.disabled = state.mergeFiles.length < 2;
}

window.removeMergeFile = (index) => {
    state.mergeFiles.splice(index, 1);
    renderMergeList();
};

document.getElementById('merge-btn').addEventListener('click', async () => {
    if (state.mergeFiles.length < 2) return;
    showStatus('Merging PDFs...');
    try { await processMerge(state.mergeFiles); } catch (err) { alert("Error: " + err.message); }
    hideStatus();
});

// ---------------- Split PDF ----------------
setupSingleFileUI('split-drop-zone', 'split-input', 'splitFile', 'application/pdf', 'split-options', 'split-file-info', 'split-btn', async (file) => {
    try {
        const fileBuffer = await fileToArrayBuffer(file);
        const pdf = await pdfjsLib.getDocument({ data: fileBuffer }).promise;
        document.getElementById('split-total-pages').textContent = `(Max: ${pdf.numPages} pages)`;
    } catch(e) {}
});

document.querySelectorAll('input[name="split-mode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        document.getElementById('split-custom-group').style.display = e.target.value === 'custom' ? 'block' : 'none';
    });
});

document.getElementById('split-btn').addEventListener('click', async () => {
    const rangeInput = document.getElementById('split-range').value;
    const mode = document.querySelector('input[name="split-mode"]:checked').value;
    if (!state.splitFile) return;
    try { await processSplit(state.splitFile, rangeInput, mode); } catch (err) { alert("Error: " + err.message); hideStatus(); }
});

// ---------------- Image to PDF ----------------
let imgSortable = null;

setupDragAndDrop('img2pdf-drop-zone', 'img2pdf-input', (files) => {
    const imageFiles = files.filter(f => f.type.startsWith('image/') || f.name.match(/\.(jpg|jpeg|png)$/i));
    state.imageFiles = [...state.imageFiles, ...imageFiles];
    renderImageList();
});

function renderImageList() {
    const list = document.getElementById('img2pdf-file-list');
    const btn = document.getElementById('img2pdf-btn');
    list.innerHTML = '';
    
    state.imageFiles.forEach((file, index) => {
        const li = document.createElement('li');
        li.className = 'image-item';
        li.dataset.index = index;
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        removeBtn.onclick = () => removeImageFile(file);
        li.appendChild(img);
        li.appendChild(removeBtn);
        list.appendChild(li);
    });
    btn.disabled = state.imageFiles.length === 0;

    if (!imgSortable && typeof Sortable !== 'undefined') {
        imgSortable = new Sortable(list, {
            animation: 150,
            onEnd: function () {
                const newArray = [];
                const items = list.querySelectorAll('.image-item');
                items.forEach(item => {
                    const originalIndex = parseInt(item.dataset.index);
                    newArray.push(state.imageFiles[originalIndex]);
                });
                state.imageFiles = newArray;
                renderImageList();
            }
        });
    }
}

window.removeImageFile = (fileToRemove) => {
    state.imageFiles = state.imageFiles.filter(f => f !== fileToRemove);
    renderImageList();
};

document.getElementById('img2pdf-btn').addEventListener('click', async () => {
    if (state.imageFiles.length === 0) return;
    showStatus('Generating PDF...');
    try { await processImageToPdf(state.imageFiles); } catch (err) { alert("Error: " + err.message); }
    hideStatus();
});

// ---------------- PDF to Word ----------------
setupSingleFileUI('pdf2word-drop-zone', 'pdf2word-input', 'pdf2wordFile', 'application/pdf', 'pdf2word-options', 'pdf2word-file-info', 'pdf2word-btn');
document.getElementById('pdf2word-btn').addEventListener('click', async () => {
    if (!state.pdf2wordFile) return;
    try { await processPdfToWord(state.pdf2wordFile); } catch (err) { alert("Error: " + err.message); hideStatus(); }
});

// ---------------- Word to PDF ----------------
setupSingleFileUI('word2pdf-drop-zone', 'word2pdf-input', 'word2pdfFile', '.docx', 'word2pdf-options', 'word2pdf-file-info', 'word2pdf-btn');
document.getElementById('word2pdf-btn').addEventListener('click', async () => {
    if (!state.word2pdfFile) return;
    try { await processWordToPdf(state.word2pdfFile); } catch (err) { alert("Error: " + err.message); hideStatus(); }
});

// ---------------- Compress PDF ----------------
setupSingleFileUI('compress-drop-zone', 'compress-input', 'compressFile', 'application/pdf', 'compress-options', 'compress-file-info', 'compress-btn');
document.getElementById('compress-btn').addEventListener('click', async () => {
    if (!state.compressFile) return;
    try { await processCompressPdf(state.compressFile); } catch (err) { alert("Error: " + err.message); hideStatus(); }
});

// ---------------- Protect PDF ----------------
setupSingleFileUI('protect-drop-zone', 'protect-input', 'protectFile', 'application/pdf', 'protect-options', 'protect-file-info', 'protect-btn');
document.getElementById('protect-btn').addEventListener('click', async () => {
    const pwd = document.getElementById('protect-password').value;
    if (!state.protectFile) return;
    if (!pwd) return alert("Please enter a password.");
    try { await processProtectPdf(state.protectFile, pwd); } catch (err) { alert("Error: " + err.message); hideStatus(); }
});

// ---------------- Unlock PDF ----------------
setupSingleFileUI('unlock-drop-zone', 'unlock-input', 'unlockFile', 'application/pdf', 'unlock-options', 'unlock-file-info', 'unlock-btn');
document.getElementById('unlock-btn').addEventListener('click', async () => {
    const pwd = document.getElementById('unlock-password').value;
    if (!state.unlockFile) return;
    try { await processUnlockPdf(state.unlockFile, pwd); } catch (err) { alert("Error: " + err.message); hideStatus(); }
});

// ---------------- Watermark PDF ----------------
setupSingleFileUI('watermark-drop-zone', 'watermark-input', 'watermarkFile', 'application/pdf', 'watermark-options', 'watermark-file-info', 'watermark-btn');
document.getElementById('watermark-btn').addEventListener('click', async () => {
    const text = document.getElementById('watermark-text').value;
    if (!state.watermarkFile) return;
    if (!text) return alert("Please enter watermark text.");
    try { await processWatermarkPdf(state.watermarkFile, text); } catch (err) { alert("Error: " + err.message); hideStatus(); }
});

// ---------------- Delete Pages ----------------
setupSingleFileUI('delete-drop-zone', 'delete-input', 'deleteFile', 'application/pdf', 'delete-options', 'delete-file-info', 'delete-btn', async (file) => {
    if (typeof generateDeleteThumbnails === 'function') {
        await generateDeleteThumbnails(file, 'delete-thumbnails');
    }
});
document.getElementById('delete-btn').addEventListener('click', async () => {
    if (!state.deleteFile) return;
    try { await processDeletePages(state.deleteFile); } catch (err) { alert("Error: " + err.message); hideStatus(); }
});
