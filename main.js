// App State
const state = {
    mergeFiles: [],
    splitFile: null,
    imageFiles: []
};

// DOM Elements
const navItems = document.querySelectorAll('.nav-item');
const sections = document.querySelectorAll('.tool-section');
const statusOverlay = document.getElementById('status-overlay');
const statusText = document.getElementById('status-text');

// Navigation
navItems.forEach(item => {
    item.addEventListener('click', () => {
        // Remove active class from all
        navItems.forEach(nav => nav.classList.remove('active'));
        sections.forEach(sec => sec.classList.remove('active-section'));

        // Add active class to clicked
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

// ---------------- Merge PDFs Logic ----------------

setupDragAndDrop('merge-drop-zone', 'merge-input', (files) => {
    const pdfFiles = files.filter(f => f.type === 'application/pdf');
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
    try {
        await processMerge(state.mergeFiles);
    } catch (err) {
        alert("Error merging PDFs: " + err.message);
    }
    hideStatus();
});


// ---------------- Split PDF Logic ----------------

setupDragAndDrop('split-drop-zone', 'split-input', (files) => {
    const pdfFiles = files.filter(f => f.type === 'application/pdf');
    if (pdfFiles.length > 0) {
        state.splitFile = pdfFiles[0]; // only take the first one
        renderSplitInfo();
    }
});

function renderSplitInfo() {
    const optionsPanel = document.getElementById('split-options');
    const fileInfo = document.getElementById('split-file-info');
    const btn = document.getElementById('split-btn');

    if (state.splitFile) {
        optionsPanel.classList.remove('hidden');
        fileInfo.textContent = `Selected: ${state.splitFile.name} (${formatBytes(state.splitFile.size)})`;
        btn.disabled = false;
    } else {
        optionsPanel.classList.add('hidden');
        btn.disabled = true;
    }
}

document.getElementById('split-btn').addEventListener('click', async () => {
    const rangeInput = document.getElementById('split-range').value;
    if (!state.splitFile) return;
    
    showStatus('Splitting PDF...');
    try {
        await processSplit(state.splitFile, rangeInput);
    } catch (err) {
        alert("Error splitting PDF: " + err.message);
    }
    hideStatus();
});


// ---------------- Image to PDF Logic ----------------

setupDragAndDrop('img2pdf-drop-zone', 'img2pdf-input', (files) => {
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
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
    try {
        await processImageToPdf(state.imageFiles);
    } catch (err) {
        alert("Error generating PDF: " + err.message);
    }
    hideStatus();
});
