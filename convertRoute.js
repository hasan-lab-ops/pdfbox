// convertRoute.js — drop-in Express route that replaces your current
// "Fast / High Accuracy" toggle with automatic per-page detection.
//
// Usage in your app.js:
//   const convertRoute = require('./convertRoute');
//   app.use('/convert', convertRoute);

const express = require('express');
const multer = require('multer');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const router = express.Router();
const upload = multer({ dest: os.tmpdir() });

// One-time check on server startup: fail loudly if the Arabic language
// pack isn't installed, instead of silently producing garbled OCR output.
function checkTesseractArabic() {
  execFile('tesseract', ['--list-langs'], (err, stdout) => {
    if (err || !stdout.includes('ara')) {
      console.error(
        '[pdf-converter] WARNING: tesseract-ocr-ara is not installed. ' +
        'Arabic OCR fallback will fail. Install with: ' +
        'apt-get install -y tesseract-ocr-ara'
      );
    }
  });
}
checkTesseractArabic();

router.post('/', upload.single('pdf'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No PDF uploaded' });
  }

  const inputPath = req.file.path;
  const outputPath = path.join(os.tmpdir(), `${req.file.filename}.docx`);
  const scriptPath = path.join(__dirname, 'pdf_to_docx.py');

  // No mode selection from the user — the script decides per page.
  execFile(
    'python3',
    [scriptPath, inputPath, outputPath, '--lang', 'ara+eng'],
    { timeout: 5 * 60 * 1000 }, // 5 min ceiling; OCR-heavy PDFs are slower
    (err, stdout, stderr) => {
      // stderr carries the per-page "source=text-layer|ocr" log lines —
      // useful to surface in your UI instead of a blind progress bar.
      console.log(stderr);

      fs.unlink(inputPath, () => {}); // clean up upload regardless of outcome

      if (err) {
        console.error('[pdf-converter] conversion failed:', err);
        return res.status(500).json({ error: 'Conversion failed', detail: stderr });
      }

      res.download(outputPath, 'converted.docx', (dlErr) => {
        fs.unlink(outputPath, () => {}); // clean up output after sending
        if (dlErr) console.error('[pdf-converter] download error:', dlErr);
      });
    }
  );
});

module.exports = router;
