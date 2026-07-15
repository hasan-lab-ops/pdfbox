// Make sure PDFLib is loaded
const { PDFDocument, rgb, degrees } = PDFLib;

// Configure PDF.js worker
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// Helper to trigger download
function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function downloadPdf(pdfBytes, filename) {
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    downloadBlob(blob, filename);
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
    if (!rangeStr.trim()) return Array.from({length: maxPages}, (_, i) => i);
    const pages = new Set();
    const parts = rangeStr.split(',');
    for (let part of parts) {
        part = part.trim();
        if (part.includes('-')) {
            let [start, end] = part.split('-').map(Number);
            if (isNaN(start) || isNaN(end)) throw new Error("Invalid range format");
            start = Math.max(1, start);
            end = Math.min(maxPages, end);
            if (start <= end) {
                for (let i = start; i <= end; i++) pages.add(i - 1);
            }
        } else {
            const num = Number(part);
            if (!isNaN(num) && num >= 1 && num <= maxPages) pages.add(num - 1);
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
        } else continue;

        const { width, height } = image.scale(1);
        const page = pdfDoc.addPage([width, height]);
        page.drawImage(image, { x: 0, y: 0, width, height });
    }
    const pdfBytes = await pdfDoc.save();
    downloadPdf(pdfBytes, 'images-converted.pdf');
}

// ---------------- PDF to Word ----------------
async function processPdfToWord(file) {
    console.log("Starting PDF to Word conversion...");
    const fileBuffer = await fileToArrayBuffer(file);
    const pdf = await pdfjsLib.getDocument({ data: fileBuffer }).promise;
    console.log(`PDF loaded. Total pages: ${pdf.numPages}`);
    let fullText = "";
    
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        
        // Horizontal Gap Detection (RTL) algorithm for Arabic
        // Group elements that are at the same height (Y)
        const linesMap = new Map();
        content.items.forEach(item => {
            // pdf.js transform[5] is the Y coordinate
            const y = Math.round(item.transform[5]);
            if (!linesMap.has(y)) {
                linesMap.set(y, []);
            }
            linesMap.get(y).push(item);
        });

        // Sort Y coordinates descending (top to bottom on standard PDF coordinates)
        const sortedY = Array.from(linesMap.keys()).sort((a, b) => b - a);
        let pageText = "";

        sortedY.forEach(y => {
            const lineItems = linesMap.get(y);
            // Sort words from right to left in descending order according to the X-coordinate (transform[4])
            lineItems.sort((a, b) => b.transform[4] - a.transform[4]);

            let lineStr = "";
            for (let j = 0; j < lineItems.length; j++) {
                const current = lineItems[j];
                lineStr += current.str;

                if (j < lineItems.length - 1) {
                    const next = lineItems[j + 1];
                    const currentX = current.transform[4];
                    const nextX = next.transform[4];
                    
                    // Calculate distance between the end of the current word and the beginning of the next
                    const gap = (currentX - current.width) - nextX;
                    if (gap > 1.5) {
                        lineStr += " ";
                    }
                }
            }
            pageText += lineStr + "\n";
        });

        console.log(`Page ${i} extracted text length: ${pageText.length} characters`);
        fullText += pageText + "\n";
    }

    console.log(`Total extracted text length: ${fullText.length} characters`);

    // Use docx library to create the Word document
    const { Document, Packer, Paragraph, TextRun, AlignmentType } = docx;
    
    // Split text by lines to create paragraphs
    const paragraphs = fullText.split('\n').map(line => {
        // Regex to match Arabic segments (including Arabic punctuation) and spaces between them
        const segmentRegex = /([\u0600-\u06FF\u060C\u061F]+(?:\s+[\u0600-\u06FF\u060C\u061F]+)*)/g;
        
        // Split the line into English and Arabic chunks to prevent LTR/RTL collision
        const segments = line.split(segmentRegex).filter(s => s.length > 0);
        
        const runs = segments.map(segment => {
            const isArabic = /[\u0600-\u06FF]/.test(segment);
            return new TextRun({
                text: segment,
                // MS Word natively handles Arabic shaping and Bidi if we flag the run as RTL!
                rightToLeft: isArabic 
            });
        });

        return new Paragraph({
            bidirectional: true,
            alignment: AlignmentType.RIGHT,
            spacing: { line: 360 }, // 1.5 lines spacing
            children: runs
        });
    });

    console.log(`Creating Word document with ${paragraphs.length} paragraphs...`);

    const doc = new Document({
        sections: [{
            properties: {},
            children: paragraphs
        }]
    });

    const blob = await Packer.toBlob(doc);
    console.log(`Word document successfully generated. Size: ${blob.size} bytes`);
    downloadBlob(blob, file.name.replace('.pdf', '.docx'));
}

// ---------------- Word to PDF ----------------
async function processWordToPdf(file) {
    const fileBuffer = await fileToArrayBuffer(file);
    const result = await mammoth.convertToHtml({ arrayBuffer: fileBuffer });
    const htmlContent = result.value;

    const container = document.getElementById('hidden-html2pdf');
    container.innerHTML = htmlContent;
    container.style.display = 'block';

    const opt = {
        margin:       10,
        filename:     file.name.replace('.docx', '.pdf'),
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2 },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    await html2pdf().set(opt).from(container).save();
    container.style.display = 'none';
    container.innerHTML = '';
}

// ---------------- Compress PDF ----------------
async function processCompressPdf(file) {
    // Basic compression by rebuilding the PDF using pdf-lib (removes unused objects/metadata)
    const fileBuffer = await fileToArrayBuffer(file);
    const sourcePdf = await PDFDocument.load(fileBuffer, { ignoreEncryption: true });
    
    // Create new doc and copy pages
    const compressedPdf = await PDFDocument.create();
    const copiedPages = await compressedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
    copiedPages.forEach((page) => compressedPdf.addPage(page));

    // Save with useObjectStreams to compress
    const pdfBytes = await compressedPdf.save({ useObjectStreams: true });
    downloadPdf(pdfBytes, file.name.replace('.pdf', '-compressed.pdf'));
}

// ---------------- Protect PDF ----------------
async function processProtectPdf(file, password) {
    // Use jsPDF to encrypt an existing PDF isn't natively supported directly via just loading.
    // So we render pages using pdf.js, then create a new jsPDF with encryption.
    const fileBuffer = await fileToArrayBuffer(file);
    const pdf = await pdfjsLib.getDocument({ data: fileBuffer }).promise;
    
    // Create jsPDF instance with encryption
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ encryption: { userPassword: password, ownerPassword: password, userPermissions: ["print", "modify"] } });
    
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        
        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
        const imgData = canvas.toDataURL('image/jpeg', 0.9);
        
        if (i > 1) doc.addPage();
        const pdfWidth = doc.internal.pageSize.getWidth();
        const pdfHeight = (viewport.height * pdfWidth) / viewport.width;
        doc.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
    }
    
    doc.save(file.name.replace('.pdf', '-protected.pdf'));
}

// ---------------- Unlock PDF ----------------
async function processUnlockPdf(file, password) {
    const fileBuffer = await fileToArrayBuffer(file);
    let pdf;
    try {
        pdf = await pdfjsLib.getDocument({ data: fileBuffer, password: password }).promise;
    } catch (e) {
        throw new Error("Invalid password or unable to read PDF.");
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        
        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
        const imgData = canvas.toDataURL('image/jpeg', 0.9);
        
        if (i > 1) doc.addPage();
        const pdfWidth = doc.internal.pageSize.getWidth();
        const pdfHeight = (viewport.height * pdfWidth) / viewport.width;
        doc.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
    }
    
    doc.save(file.name.replace('.pdf', '-unlocked.pdf'));
}

// ---------------- Watermark PDF ----------------
async function processWatermarkPdf(file, text) {
    const fileBuffer = await fileToArrayBuffer(file);
    const pdfDoc = await PDFDocument.load(fileBuffer);
    const pages = pdfDoc.getPages();
    
    for (const page of pages) {
        const { width, height } = page.getSize();
        page.drawText(text, {
            x: width / 4,
            y: height / 2,
            size: 50,
            color: rgb(0.5, 0.5, 0.5),
            opacity: 0.3,
            rotate: degrees(45),
        });
    }
    
    const pdfBytes = await pdfDoc.save();
    downloadPdf(pdfBytes, file.name.replace('.pdf', '-watermarked.pdf'));
}
