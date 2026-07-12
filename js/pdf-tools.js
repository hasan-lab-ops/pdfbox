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
                // For demo, just extract first page
                resultBytes = await extractFirstPage(files[0]);
                resultFileName = 'split-page-1.pdf';
                break;
            case 'compress':
                // pdf-lib can't deeply compress images, but resaving without objects can help
                resultBytes = await compressPDF(files[0]);
                resultFileName = 'compressed.pdf';
                break;
            case 'rotate':
                const rotation = document.getElementById('tool-rotation')?.value || 90;
                resultBytes = await rotatePDF(files[0], parseInt(rotation));
                resultFileName = 'rotated.pdf';
                break;
            case 'delete':
                // For demo, delete last page
                resultBytes = await deleteLastPage(files[0]);
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

async function extractFirstPage(file) {
    const buffer = await fileToBuffer(file);
    const pdf = await PDFDocument.load(buffer);
    const newPdf = await PDFDocument.create();
    const [page] = await newPdf.copyPages(pdf, [0]);
    newPdf.addPage(page);
    return await newPdf.save();
}

async function compressPDF(file) {
    const buffer = await fileToBuffer(file);
    const pdf = await PDFDocument.load(buffer);
    // Saving without keeping objects uncompressed will often reduce size a bit if it was bloated
    return await pdf.save({ useObjectStreams: true }); 
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

async function deleteLastPage(file) {
    const buffer = await fileToBuffer(file);
    const pdf = await PDFDocument.load(buffer);
    const count = pdf.getPageCount();
    if (count > 1) {
        pdf.removePage(count - 1);
    }
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
    // As above, decrypt requires crypto.
    return buffer;
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
    // using pdf.js
    const buffer = await fileToBuffer(file);
    const typedarray = new Uint8Array(buffer);
    
    const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
    
    // For demo, just convert the first page
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2.0 }); // High res
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    await page.render({
        canvasContext: context,
        viewport: viewport
    }).promise;
    
    // Download image
    canvas.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'page-1.jpg';
        a.click();
        URL.revokeObjectURL(url);
    }, 'image/jpeg', 0.9);
}

async function mockConversion(toolId, file) {
    return new Promise((resolve) => {
        setTimeout(() => {
            alert(`Mock conversion for ${toolId} completed successfully!`);
            resolve();
        }, 2000);
    });
}
