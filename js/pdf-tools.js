const { PDFDocument, rgb, degrees } = PDFLib;

window.processPDF = async function(toolId, files) {
    window.setProcessingState(true);
    
    try {
        let resultBytes = null;
        let resultFileName = 'output.pdf';
        
        switch (toolId) {
            case 'merge':
                resultBytes = await mergePDFs(files);
                resultFileName = 'merged.pdf';
                break;
            case 'split':
                const splitRange = document.getElementById('tool-range')?.value || '';
                resultBytes = await extractPages(files[0], splitRange);
                resultFileName = 'split-output.pdf';
                break;
            case 'compress':
                resultBytes = await compressPDF(files[0]);
                resultFileName = 'compressed.pdf';
                break;
            case 'rotate':
                const rotation = document.getElementById('tool-rotation')?.value || 90;
                resultBytes = await rotatePDF(files[0], parseInt(rotation));
                resultFileName = 'rotated.pdf';
                break;
            case 'delete':
                const deleteRange = document.getElementById('tool-range')?.value || '';
                resultBytes = await deletePages(files[0], deleteRange);
                resultFileName = 'deleted-pages.pdf';
                break;
            case 'protect':
                const pw = document.getElementById('tool-password')?.value;
                if (!pw) throw new Error("Password is required");
                resultBytes = await protectPDF(files[0], pw);
                resultFileName = 'protected.pdf';
                break;
            case 'unlock':
                const currentPw = document.getElementById('tool-password')?.value;
                resultBytes = await unlockPDF(files[0], currentPw);
                resultFileName = 'unlocked.pdf';
                break;
            case 'watermark':
                const text = document.getElementById('tool-watermark')?.value || 'CONFIDENTIAL';
                resultBytes = await watermarkPDF(files[0], text);
                resultFileName = 'watermarked.pdf';
                break;
            case 'jpg-to-pdf':
                resultBytes = await jpgToPdf(files);
                resultFileName = 'converted.pdf';
                break;
            case 'pdf-to-jpg':
                await pdfToJpg(files[0]); // Handles download internally per page
                window.setProcessingState(false);
                return;
            case 'pdf-to-word':
            case 'word-to-pdf':
                await mockConversion(toolId, files[0]);
                window.setProcessingState(false);
                return;
            default:
                throw new Error("Tool not implemented yet.");
        }
        
        if (resultBytes) {
            downloadBlob(resultBytes, resultFileName, 'application/pdf');
        }
        
    } catch (error) {
        console.error(error);
        alert('Error processing file: ' + error.message);
    } finally {
        window.setProcessingState(false);
    }
};

// --- Helper Functions ---
async function fileToBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

function downloadBlob(bytes, filename, type) {
    const blob = new Blob([bytes], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// --- PDF Logic Implementations ---

async function mergePDFs(files) {
    const mergedPdf = await PDFDocument.create();
    for (const file of files) {
        const buffer = await fileToBuffer(file);
        const pdf = await PDFDocument.load(buffer);
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
    }
    return await mergedPdf.save();
}

function parsePageRange(rangeInput, pageCount) {
    if (!rangeInput || !rangeInput.trim()) {
        return Array.from({ length: pageCount }, (_, index) => index);
    }

    const pages = new Set();
    const tokens = rangeInput.split(',').map(token => token.trim()).filter(Boolean);

    for (const token of tokens) {
        const rangeMatch = token.match(/^(\d+)\s*-\s*(\d+)$/);
        if (rangeMatch) {
            let start = parseInt(rangeMatch[1], 10);
            let end = parseInt(rangeMatch[2], 10);
            if (start > end) [start, end] = [end, start];
            for (let page = start; page <= end; page++) {
                if (page < 1 || page > pageCount) {
                    throw new Error(`Invalid page range: ${page} is outside document bounds.`);
                }
                pages.add(page - 1);
            }
            continue;
        }

        const singleMatch = token.match(/^(\d+)$/);
        if (singleMatch) {
            const page = parseInt(singleMatch[1], 10);
            if (page < 1 || page > pageCount) {
                throw new Error(`Invalid page number: ${page} is outside document bounds.`);
            }
            pages.add(page - 1);
            continue;
        }

        throw new Error(`Invalid page range format: '${token}'. Use formats like 1-3,5.`);
    }

    return Array.from(pages).sort((a, b) => a - b);
}

async function extractPages(file, range) {
    const buffer = await fileToBuffer(file);
    const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const pageCount = pdf.getPageCount();
    const pageIndices = parsePageRange(range, pageCount);

    const newPdf = await PDFDocument.create();
    const pages = await newPdf.copyPages(pdf, pageIndices);
    pages.forEach((page) => newPdf.addPage(page));
    return await newPdf.save();
}

async function compressPDF(file) {
    const buffer = await fileToBuffer(file);
    const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const newPdf = await PDFDocument.create();
    const pages = await newPdf.copyPages(pdf, pdf.getPageIndices());
    pages.forEach((page) => newPdf.addPage(page));
    return await newPdf.save({ useObjectStreams: true, updateFieldAppearances: false });
}

async function rotatePDF(file, degreesVal) {
    const buffer = await fileToBuffer(file);
    const pdf = await PDFDocument.load(buffer);
    const pages = pdf.getPages();
    pages.forEach(page => {
        const currentRotation = page.getRotation().angle;
        page.setRotation(degrees(currentRotation + degreesVal));
    });
    return await pdf.save();
}

async function deletePages(file, pagesToDelete) {
    const buffer = await fileToBuffer(file);
    const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const count = pdf.getPageCount();
    const pageIndices = parsePageRange(pagesToDelete, count);

    // Remove pages in reverse order to keep indexes stable
    pageIndices.reverse().forEach(index => pdf.removePage(index));
    return await pdf.save();
}

async function protectPDF(file, password) {
    const buffer = await fileToBuffer(file);
    // Note: pdf-lib doesn't natively support full RC4/AES encryption in standard build easily
    // We mock this by saving the file and warning user for this demo.
    // In a real scenario, this requires node.js backend or specialized wasm library like pdf-lib with crypto
    alert("Notice: True encryption requires backend/crypto libraries. This is a mockup.");
    return buffer; 
}

async function unlockPDF(file, password) {
    const buffer = await fileToBuffer(file);
    // If the file is encrypted, ignoreEncryption will attempt to load it without enforcing the password.
    const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
    return await pdf.save();
}

async function watermarkPDF(file, text) {
    const buffer = await fileToBuffer(file);
    const pdf = await PDFDocument.load(buffer);
    const pages = pdf.getPages();
    
    pages.forEach(page => {
        const { width, height } = page.getSize();
        page.drawText(text, {
            x: 50,
            y: height / 2,
            size: 50,
            color: rgb(0.95, 0.1, 0.1),
            rotate: degrees(45),
            opacity: 0.3,
        });
    });
    return await pdf.save();
}

async function jpgToPdf(files) {
    const pdf = await PDFDocument.create();
    
    for (const file of files) {
        const buffer = await fileToBuffer(file);
        let image;
        if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
            image = await pdf.embedJpg(buffer);
        } else if (file.type === 'image/png') {
            image = await pdf.embedPng(buffer);
        } else {
            continue;
        }
        
        const page = pdf.addPage([image.width, image.height]);
        page.drawImage(image, {
            x: 0,
            y: 0,
            width: image.width,
            height: image.height,
        });
    }
    return await pdf.save();
}

async function pdfToJpg(file) {
    const buffer = await fileToBuffer(file);
    const typedarray = new Uint8Array(buffer);
    const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
    const numPages = pdf.numPages;

    for (let pageNumber = 1; pageNumber <= numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({
            canvasContext: context,
            viewport: viewport
        }).promise;

        await new Promise((resolve, reject) => {
            canvas.toBlob(blob => {
                if (!blob) {
                    reject(new Error('Unable to create image blob.'));
                    return;
                }
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `page-${pageNumber}.jpg`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                resolve();
            }, 'image/jpeg', 0.9);
        });
    }
}

async function mockConversion(toolId, file) {
    return new Promise((resolve) => {
        setTimeout(() => {
            alert(`Mock conversion for ${toolId} completed successfully!`);
            resolve();
        }, 2000);
    });
}
