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
    watermarkFile: null
};

// DOM Elements
const navItems = document.querySelectorAll('.nav-item');
const sections = document.querySelectorAll('.tool-section');
const statusOverlay = document.getElementById('status-overlay');
const statusText = document.getElementById('status-text');

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

function showStatus(message) {
    statusText.textContent = message;
    statusOverlay.classList.remove('hidden');
}

function hideStatus() {
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

function setupSingleFileUI(dropId, inputId, stateKey, expectedType, optionsId, fileInfoId, btnId) {
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
setupSingleFileUI('split-drop-zone', 'split-input', 'splitFile', 'application/pdf', 'split-options', 'split-file-info', 'split-btn');

document.getElementById('split-btn').addEventListener('click', async () => {
    const rangeInput = document.getElementById('split-range').value;
    if (!state.splitFile) return;
    showStatus('Splitting PDF...');
    try { await processSplit(state.splitFile, rangeInput); } catch (err) { alert("Error: " + err.message); }
    hideStatus();
});

// ---------------- Image to PDF ----------------
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
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        removeBtn.onclick = () => removeImageFile(index);
        li.appendChild(img);
        li.appendChild(removeBtn);
        list.appendChild(li);
    });
    btn.disabled = state.imageFiles.length === 0;
}

window.removeImageFile = (index) => {
    state.imageFiles.splice(index, 1);
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
    showStatus('Converting to Word...');
    try { await processPdfToWord(state.pdf2wordFile); } catch (err) { alert("Error: " + err.message); }
    hideStatus();
});

// ---------------- Word to PDF ----------------
setupSingleFileUI('word2pdf-drop-zone', 'word2pdf-input', 'word2pdfFile', '.docx', 'word2pdf-options', 'word2pdf-file-info', 'word2pdf-btn');
document.getElementById('word2pdf-btn').addEventListener('click', async () => {
    if (!state.word2pdfFile) return;
    showStatus('Converting to PDF...');
    try { await processWordToPdf(state.word2pdfFile); } catch (err) { alert("Error: " + err.message); }
    hideStatus();
});

// ---------------- Compress PDF ----------------
setupSingleFileUI('compress-drop-zone', 'compress-input', 'compressFile', 'application/pdf', 'compress-options', 'compress-file-info', 'compress-btn');
document.getElementById('compress-btn').addEventListener('click', async () => {
    if (!state.compressFile) return;
    showStatus('Compressing PDF...');
    try { await processCompressPdf(state.compressFile); } catch (err) { alert("Error: " + err.message); }
    hideStatus();
});

// ---------------- Protect PDF ----------------
setupSingleFileUI('protect-drop-zone', 'protect-input', 'protectFile', 'application/pdf', 'protect-options', 'protect-file-info', 'protect-btn');
document.getElementById('protect-btn').addEventListener('click', async () => {
    const pwd = document.getElementById('protect-password').value;
    if (!state.protectFile) return;
    if (!pwd) return alert("Please enter a password.");
    showStatus('Protecting PDF...');
    try { await processProtectPdf(state.protectFile, pwd); } catch (err) { alert("Error: " + err.message); }
    hideStatus();
});

// ---------------- Unlock PDF ----------------
setupSingleFileUI('unlock-drop-zone', 'unlock-input', 'unlockFile', 'application/pdf', 'unlock-options', 'unlock-file-info', 'unlock-btn');
document.getElementById('unlock-btn').addEventListener('click', async () => {
    const pwd = document.getElementById('unlock-password').value;
    if (!state.unlockFile) return;
    showStatus('Unlocking PDF...');
    try { await processUnlockPdf(state.unlockFile, pwd); } catch (err) { alert("Error: " + err.message); }
    hideStatus();
});

// ---------------- Watermark PDF ----------------
setupSingleFileUI('watermark-drop-zone', 'watermark-input', 'watermarkFile', 'application/pdf', 'watermark-options', 'watermark-file-info', 'watermark-btn');
document.getElementById('watermark-btn').addEventListener('click', async () => {
    const text = document.getElementById('watermark-text').value;
    if (!state.watermarkFile) return;
    if (!text) return alert("Please enter watermark text.");
    showStatus('Adding Watermark...');
    try { await processWatermarkPdf(state.watermarkFile, text); } catch (err) { alert("Error: " + err.message); }
    hideStatus();
});
