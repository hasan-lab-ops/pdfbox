const fs = require('fs');
const file = 'c:/Users/capy1/Desktop/front end2/js/pdf-tools.js';
const content = fs.readFileSync(file, 'utf8');
const lines = content.split(/\r?\n/);

const startIdx = lines.findIndex(l => l.includes('async function convertWordToPdf(file) {'));
const endIdx = lines.findIndex((l, i) => i > startIdx && l.includes("case 'unlock-pdf':"));

if (startIdx !== -1 && endIdx !== -1) {
  const replacement = `        converter = new WordToPDFConverter();
        blob = await converter.convert(file);
        outputFilename = file.name.replace(/\\.docx?$/i, '.pdf') || 'document.pdf';
        break;

      case 'protect-pdf':
        if (!file.type.includes('pdf') && !file.name.endsWith('.pdf')) {
          showToast('Please select a PDF file', 'error');
          hideLoading();
          return;
        }
        if (!password) {
          showToast('Please enter a password', 'error');
          hideLoading();
          return;
        }
        converter = new PDFEncryptor();
        blob = await converter.encrypt(file, password);
        outputFilename = file.name.replace(/\\.pdf$/i, '_protected.pdf') || 'protected.pdf';
        break;`;
  
  lines.splice(startIdx, endIdx - startIdx, replacement);
  fs.writeFileSync(file, lines.join('\n'));
  console.log("Successfully fixed pdf-tools.js");
} else {
  console.log("Could not find bounds", startIdx, endIdx);
}
