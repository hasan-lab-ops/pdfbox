const app = {
  init() {
    // Detect which page we are on based on specific elements
    if (document.getElementById('merge-upload')) {
      this.setupMerge();
    }
    if (document.getElementById('split-upload')) {
      this.setupSplit();
    }
    if (document.getElementById('watermark-upload')) {
      this.setupWatermark();
    }
    if (document.getElementById('img-upload')) {
      this.setupImageToPdf();
    }
  },

  /* MERGE PDF LOGIC */
  setupMerge() {
    let selectedFiles = [];
    const uploadInput = document.getElementById('merge-upload');
    const fileList = document.getElementById('merge-file-list');
    const filesUl = document.getElementById('merge-files-ul');
    const actionBtn = document.getElementById('merge-action-btn');
    const downloadLink = document.getElementById('merge-download-link');
    const errorDiv = document.getElementById('merge-error');

    uploadInput.addEventListener('change', (e) => {
      selectedFiles = Array.from(e.target.files);
      errorDiv.style.display = 'none';
      downloadLink.classList.add('hidden');
      actionBtn.classList.remove('hidden');

      if (selectedFiles.length > 0) {
        fileList.classList.remove('hidden');
        filesUl.innerHTML = selectedFiles.map((f, i) => `<li>${i + 1}. ${f.name}</li>`).join('');
        actionBtn.disabled = selectedFiles.length < 2;
      } else {
        fileList.classList.add('hidden');
        actionBtn.disabled = true;
      }
    });

    actionBtn.addEventListener('click', async () => {
      try {
        actionBtn.innerHTML = '<i class="spin-icon" data-lucide="loader-2"></i> Merging...';
        lucide.createIcons();
        actionBtn.disabled = true;

        const { PDFDocument } = PDFLib;
        const mergedPdf = await PDFDocument.create();

        for (const file of selectedFiles) {
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await PDFDocument.load(arrayBuffer);
          const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
          copiedPages.forEach((page) => mergedPdf.addPage(page));
        }

        const pdfBytes = await mergedPdf.save();
        const blob = new Blob([pdfBytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        
        downloadLink.href = url;
        downloadLink.download = "merged-document.pdf";
        actionBtn.classList.add('hidden');
        downloadLink.classList.remove('hidden');
      } catch (err) {
        console.error(err);
        errorDiv.textContent = "Failed to merge PDFs. Make sure they are valid PDF files.";
        errorDiv.style.display = 'block';
      } finally {
        actionBtn.innerHTML = 'Merge PDFs';
        actionBtn.disabled = false;
      }
    });
  },

  /* SPLIT PDF LOGIC */
  setupSplit() {
    let selectedFile = null;
    let pageCount = 0;
    const uploadInput = document.getElementById('split-upload');
    const fileInfo = document.getElementById('split-file-info');
    const fileNameEl = document.getElementById('split-filename');
    const pageCountEl = document.getElementById('split-pagecount');
    const actionBtn = document.getElementById('split-action-btn');
    const downloadLink = document.getElementById('split-download-link');
    const errorDiv = document.getElementById('split-error');

    uploadInput.addEventListener('change', async (e) => {
      if (e.target.files && e.target.files[0]) {
        selectedFile = e.target.files[0];
        errorDiv.style.display = 'none';
        downloadLink.classList.add('hidden');
        actionBtn.classList.remove('hidden');
        actionBtn.disabled = true;

        try {
          const arrayBuffer = await selectedFile.arrayBuffer();
          const { PDFDocument } = PDFLib;
          const pdfDoc = await PDFDocument.load(arrayBuffer);
          pageCount = pdfDoc.getPageCount();

          fileInfo.classList.remove('hidden');
          fileNameEl.textContent = selectedFile.name;
          pageCountEl.textContent = `${pageCount} pages detected`;
          actionBtn.disabled = false;
        } catch (err) {
          console.error(err);
          errorDiv.textContent = "Could not read the PDF file.";
          errorDiv.style.display = 'block';
        }
      }
    });

    actionBtn.addEventListener('click', async () => {
      try {
        actionBtn.innerHTML = '<i class="spin-icon" data-lucide="loader-2"></i> Splitting...';
        lucide.createIcons();
        actionBtn.disabled = true;

        const arrayBuffer = await selectedFile.arrayBuffer();
        const { PDFDocument } = PDFLib;
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        const zip = new JSZip();

        for (let i = 0; i < pageCount; i++) {
          const newPdf = await PDFDocument.create();
          const [copiedPage] = await newPdf.copyPages(pdfDoc, [i]);
          newPdf.addPage(copiedPage);
          const pdfBytes = await newPdf.save();
          zip.file(`split_page_${i + 1}.pdf`, pdfBytes);
        }

        const zipBlob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(zipBlob);
        
        downloadLink.href = url;
        downloadLink.download = `${selectedFile.name.replace('.pdf', '')}_split.zip`;
        actionBtn.classList.add('hidden');
        downloadLink.classList.remove('hidden');
      } catch (err) {
        console.error(err);
        errorDiv.textContent = "Failed to split the PDF.";
        errorDiv.style.display = 'block';
      } finally {
        actionBtn.innerHTML = 'Split PDF';
        actionBtn.disabled = false;
      }
    });
  },

  /* WATERMARK PDF LOGIC */
  setupWatermark() {
    let selectedFile = null;
    const uploadInput = document.getElementById('watermark-upload');
    const fileInfo = document.getElementById('watermark-file-info');
    const fileNameEl = document.getElementById('watermark-filename');
    const textInput = document.getElementById('watermark-text');
    const actionBtn = document.getElementById('watermark-action-btn');
    const downloadLink = document.getElementById('watermark-download-link');
    const errorDiv = document.getElementById('watermark-error');

    uploadInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        selectedFile = e.target.files[0];
        errorDiv.style.display = 'none';
        downloadLink.classList.add('hidden');
        actionBtn.classList.remove('hidden');

        fileInfo.classList.remove('hidden');
        fileNameEl.textContent = selectedFile.name;
        checkWatermarkStatus();
      }
    });

    textInput.addEventListener('input', checkWatermarkStatus);

    function checkWatermarkStatus() {
      if (selectedFile && textInput.value.trim().length > 0) {
        actionBtn.disabled = false;
      } else {
        actionBtn.disabled = true;
      }
    }

    actionBtn.addEventListener('click', async () => {
      try {
        actionBtn.innerHTML = '<i class="spin-icon" data-lucide="loader-2"></i> Processing...';
        lucide.createIcons();
        actionBtn.disabled = true;

        const arrayBuffer = await selectedFile.arrayBuffer();
        const { PDFDocument, rgb, degrees } = PDFLib;
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        const pages = pdfDoc.getPages();
        const watermarkText = textInput.value;

        for (const page of pages) {
          const { width, height } = page.getSize();
          page.drawText(watermarkText, {
            x: width / 2 - 150,
            y: height / 2,
            size: 60,
            color: rgb(0.7, 0.7, 0.7),
            opacity: 0.5,
            rotate: degrees(-45),
          });
        }

        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        
        downloadLink.href = url;
        downloadLink.download = `${selectedFile.name.replace('.pdf', '')}_watermarked.pdf`;
        actionBtn.classList.add('hidden');
        downloadLink.classList.remove('hidden');
      } catch (err) {
        console.error(err);
        errorDiv.textContent = "Failed to watermark the PDF. Make sure it is not encrypted.";
        errorDiv.style.display = 'block';
      } finally {
        actionBtn.innerHTML = 'Add Watermark';
        checkWatermarkStatus();
      }
    });
  },

  /* IMAGE TO PDF LOGIC */
  setupImageToPdf() {
    let selectedFiles = [];
    const uploadInput = document.getElementById('img-upload');
    const fileList = document.getElementById('img-file-list');
    const filesUl = document.getElementById('img-files-ul');
    const actionBtn = document.getElementById('img-action-btn');
    const downloadLink = document.getElementById('img-download-link');
    const errorDiv = document.getElementById('img-error');

    uploadInput.addEventListener('change', (e) => {
      selectedFiles = Array.from(e.target.files);
      errorDiv.style.display = 'none';
      downloadLink.classList.add('hidden');
      actionBtn.classList.remove('hidden');

      if (selectedFiles.length > 0) {
        fileList.classList.remove('hidden');
        filesUl.innerHTML = selectedFiles.map((f, i) => `<li>${i + 1}. ${f.name}</li>`).join('');
        actionBtn.disabled = false;
      } else {
        fileList.classList.add('hidden');
        actionBtn.disabled = true;
      }
    });

    actionBtn.addEventListener('click', async () => {
      try {
        actionBtn.innerHTML = '<i class="spin-icon" data-lucide="loader-2"></i> Converting...';
        lucide.createIcons();
        actionBtn.disabled = true;

        const { PDFDocument } = PDFLib;
        const pdfDoc = await PDFDocument.create();

        for (const file of selectedFiles) {
          const arrayBuffer = await file.arrayBuffer();
          let image;
          
          if (file.type === "image/jpeg" || file.type === "image/jpg") {
            image = await pdfDoc.embedJpg(arrayBuffer);
          } else if (file.type === "image/png") {
            image = await pdfDoc.embedPng(arrayBuffer);
          } else {
            throw new Error("Unsupported image format. Please use JPG or PNG.");
          }

          const page = pdfDoc.addPage([image.width, image.height]);
          page.drawImage(image, {
            x: 0,
            y: 0,
            width: image.width,
            height: image.height,
          });
        }

        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        
        downloadLink.href = url;
        downloadLink.download = `converted_images.pdf`;
        actionBtn.classList.add('hidden');
        downloadLink.classList.remove('hidden');
      } catch (err) {
        console.error(err);
        errorDiv.textContent = err.message || "Failed to convert images to PDF.";
        errorDiv.style.display = 'block';
      } finally {
        actionBtn.innerHTML = 'Convert to PDF';
        actionBtn.disabled = false;
      }
    });
  }
};

// Initialize App on DOM Content Loaded
document.addEventListener('DOMContentLoaded', () => {
  app.init();
});
