const fs = require('fs');
let code = fs.readFileSync('c:/Users/capy1/Desktop/New folder/main_tail.js', 'utf8');

// List of comments we know exist in main_tail.js
const replacements = [
  ['// proper Word format', '/* proper Word format */'],
  ["// Don't hardcode a single font — let CSS handle per-script font selection", "/* Don't hardcode a single font — let CSS handle per-script font selection */"],
  ['// CRITICAL: let browser BiDi engine handle directional layout', '/* CRITICAL: let browser BiDi engine handle directional layout */'],
  ['// ── Post-process mammoth HTML for proper Arabic/RTL rendering ──────────', '/* ── Post-process mammoth HTML for proper Arabic/RTL rendering ────────── */'],
  ['// mammoth.js strips dir= and lang= from the .docx content. We must restore', '/* mammoth.js strips dir= and lang= from the .docx content. We must restore */'],
  ["// them so the browser's Unicode Bidirectional Algorithm can shape Arabic", "/* them so the browser's Unicode Bidirectional Algorithm can shape Arabic */"],
  ['// glyphs correctly *before* html2canvas photographs the DOM.', '/* glyphs correctly *before* html2canvas photographs the DOM. */'],
  ['// Block elements that carry a reading direction in Word', '/* Block elements that carry a reading direction in Word */'],
  ['// Use bdi on inline runs; set dir on block so the browser BiDi', '/* Use bdi on inline runs; set dir on block so the browser BiDi */'],
  ['// algorithm can order runs correctly within the paragraph.', '/* algorithm can order runs correctly within the paragraph. */'],
  ['// Wrap inline text nodes in <bdi dir="rtl"> so mixed LTR/RTL lines', '/* Wrap inline text nodes in <bdi dir="rtl"> so mixed LTR/RTL lines */'],
  ['// (e.g. Arabic paragraph with embedded English code) render cleanly.', '/* (e.g. Arabic paragraph with embedded English code) render cleanly. */'],
  ["// Purely LTR block — be explicit so adjacent RTL blocks don't bleed", "/* Purely LTR block — be explicit so adjacent RTL blocks don't bleed */"],
  ['// Parse mammoth HTML into a live fragment so we can walk the DOM', '/* Parse mammoth HTML into a live fragment so we can walk the DOM */'],
  ['// Serialize fragment back to HTML string for injection', '/* Serialize fragment back to HTML string for injection */'],
  ['// Add inline styles for common HTML elements', '/* Add inline styles for common HTML elements */'],
  ['// Note: Arabic text gets Arial/Segoe UI via per-element injection above.', '/* Note: Arabic text gets Arial/Segoe UI via per-element injection above. */'],
  ['// LTR text keeps Times New Roman. This mirrors Microsoft Word defaults.', '/* LTR text keeps Times New Roman. This mirrors Microsoft Word defaults. */'],
  ['/* Arabic blocks — right-aligned, correct font */', '/* Arabic blocks — right-aligned, correct font */'],
  ["/* Mixed paragraph: isolate each run's direction */", "/* Mixed paragraph: isolate each run's direction */"],
  ['// Wait for images to load', '/* Wait for images to load */'],
  ['// A4 in PDF points', '/* A4 in PDF points */'],
  ['// /2 because scale:2', '/* /2 because scale:2 */'],
  ['// *2 for canvas scale', '/* *2 for canvas scale */'],
  ['// Clear form', '/* Clear form */']
];

for (const [find, replace] of replacements) {
  code = code.replace(find, replace);
}

fs.writeFileSync('c:/Users/capy1/Desktop/New folder/main_tail_fixed.js', code);
