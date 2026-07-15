// Make sure PDFLib is loaded
const { PDFDocument } = PDFLib;

// Helper to trigger download
function downloadPdf(pdfBytes, filename) {
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Convert File to ArrayBuffer
function fileToArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

// ---------------- Merge ----------------
async function processMerge(files) {
    const mergedPdf = await PDFDocument.create();

    for (let i = 0; i < files.length; i++) {
        const fileBuffer = await fileToArrayBuffer(files[i]);
        const pdf = await PDFDocument.load(fileBuffer);
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
    }

    const pdfBytes = await mergedPdf.save();
    downloadPdf(pdfBytes, 'merged-document.pdf');
}

// ---------------- Split ----------------
function parseRangeStr(rangeStr, maxPages) {
    if (!rangeStr.trim()) {
        // If empty, return all pages
        return Array.from({length: maxPages}, (_, i) => i);
    }

    const pages = new Set();
    const parts = rangeStr.split(',');

    for (let part of parts) {
        part = part.trim();
        if (part.includes('-')) {
            let [start, end] = part.split('-').map(Number);
            if (isNaN(start) || isNaN(end)) throw new Error("Invalid range format");
            
            // Handle limits
            start = Math.max(1, start);
            end = Math.min(maxPages, end);
            
            if (start <= end) {
                for (let i = start; i <= end; i++) pages.add(i - 1); // 0-indexed
            }
        } else {
            const num = Number(part);
            if (!isNaN(num) && num >= 1 && num <= maxPages) {
                pages.add(num - 1);
            }
        }
    }

    if (pages.size === 0) throw new Error("No valid pages selected.");
    return Array.from(pages).sort((a, b) => a - b);
}

async function processSplit(file, rangeStr) {
    const fileBuffer = await fileToArrayBuffer(file);
    const sourcePdf = await PDFDocument.load(fileBuffer);
    const totalPages = sourcePdf.getPageCount();

    const pagesToExtract = parseRangeStr(rangeStr, totalPages);

    const splitPdf = await PDFDocument.create();
    const copiedPages = await splitPdf.copyPages(sourcePdf, pagesToExtract);
    copiedPages.forEach((page) => splitPdf.addPage(page));

    const pdfBytes = await splitPdf.save();
    downloadPdf(pdfBytes, `split-${file.name}`);
}

// ---------------- Image to PDF ----------------
async function processImageToPdf(imageFiles) {
    const pdfDoc = await PDFDocument.create();

    for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        const imageBytes = await fileToArrayBuffer(file);
        
        let image;
        if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
            image = await pdfDoc.embedJpg(imageBytes);
        } else if (file.type === 'image/png') {
            image = await pdfDoc.embedPng(imageBytes);
        } else {
            console.warn("Unsupported image type:", file.type);
            continue;
        }

        const { width, height } = image.scale(1);
        const page = pdfDoc.addPage([width, height]);
        
        page.drawImage(image, {
            x: 0,
            y: 0,
            width: width,
            height: height,
        });
    }

    const pdfBytes = await pdfDoc.save();
    downloadPdf(pdfBytes, 'images-converted.pdf');
}
